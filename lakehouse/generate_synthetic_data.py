"""
Coherent synthetic breast-cancer data generator (Phase 1 - coordinator rewrite).

Builds ONE coherent record per patient in a single pass so everything ties together:
  * patient + encounter + diagnosis + all reports share consistent ids and dates
    (encounter_id == ENC{1000000+i} everywhere -> referential integrity)
  * every report's narrative MATCHES the diagnosis (a benign case never gets a
    malignant path report; labs/meds match the tumor biology)
  * correct behavior codes (benign /0, in-situ /2, malignant /3, uncertain /1)
  * temporally consistent, recent dates (DOB -> diagnosis 2023-2026 -> encounter/reports)
  * real per-case variation (grade, size, nodes, ER/PR/HER2)
  * realistic volumes (~200 patients, low tens of thousands of rows total)

Table schemas are unchanged from the prior version so the Silver pipeline still reads them.
Run on serverless; reproducible via the fixed seed.
"""
from datetime import datetime, timedelta
import random
import sys
from pyspark.sql import SparkSession

random.seed(42)

FIRST = ["Margaret","Patricia","Helen","Sandra","Ashley","Elizabeth","Catherine","Rebecca",
         "Sharon","Susan","Jennifer","Dorothy","Maria","Linda","Karen","Nancy","Angela","Grace","Jane","Denise"]
LAST  = ["Johnson","Smith","Brown","Davis","Miller","Moore","Taylor","Anderson","Thomas","Jackson",
         "White","Harris","Okafor","Delgado","Nguyen","Patel","Cohen","Rossi","Alvarez","Kim"]

# (case_type, weight). Reportable to a breast registry = IDC, ILC, DCIS.
CASE_WEIGHTS = [("IDC",0.30),("ILC",0.12),("DCIS",0.16),          # reportable ~58%
                ("Fibroadenoma",0.13),("Fibrocystic",0.10),("BCC_skin",0.04),  # non-reportable ~27%
                ("ADH",0.15)]                                     # ambiguous/uncertain ~15%

# per-type diagnosis coding: code, description, behavior, reportable
DX = {
 "IDC":         ("C50.911","Malignant neoplasm of upper-outer quadrant of right breast",3,True),
 "ILC":         ("C50.921","Malignant neoplasm of upper-outer quadrant of left breast",3,True),
 "DCIS":        ("D05.11", "Intraductal carcinoma in situ of right breast",2,True),
 "Fibroadenoma":("D24.1",  "Benign neoplasm of right breast",0,False),
 "Fibrocystic": ("N60.11", "Diffuse cystic mastopathy of right breast",0,False),
 "BCC_skin":    ("C44.501","Basal cell carcinoma of skin of breast",3,False),  # skin, NOT breast-registry reportable
 "ADH":         ("D48.61", "Neoplasm of uncertain behavior of right breast",1,False),
}

def _flag(pos_prob):  # returns (label, pct)
    if random.random() < pos_prob:
        return "Positive", random.randint(60, 98)
    return "Negative", random.randint(0, 5)

def build_case(i):
    ct = random.choices([c for c,_ in CASE_WEIGHTS], weights=[w for _,w in CASE_WEIGHTS])[0]
    code, desc, behavior, reportable = DX[ct]
    age = random.randint(40, 75)
    dxd = datetime(random.choice([2023,2024,2025,2026]), random.randint(1,12), random.randint(1,28))
    dob = datetime(dxd.year - age, random.randint(1,12), random.randint(1,28))
    encd = dxd + timedelta(days=random.randint(0,10))
    side = "right" if code.endswith(("1","01")) else "left"

    pid = f"PAT{1000000+i}"; enc = f"ENC{1000000+i}"
    ts = datetime.now()

    # ---- clinical params (varied) ----
    grade = random.choice(["I","II","III"])
    size = round(random.uniform(0.6, 3.6), 1)
    nodes_ex = random.choice([2,3,4]); nodes_pos = random.randint(0, nodes_ex)
    er_l, er_p = _flag(0.78); pr_l, pr_p = _flag(0.65)
    her2_l = "Positive (3+)" if random.random() < 0.20 else "Negative"
    margin = random.choice(["uninvolved (>2 mm)","uninvolved (1-2 mm)","close (<1 mm)"])

    # ---- pathology narrative, matched to case type ----
    if ct in ("IDC","ILC"):
        hist = "ductal" if ct=="IDC" else "lobular"
        growth = "" if ct=="IDC" else " with single-file infiltrative growth"
        path = [
            ("Clinical History", f"{age}-year-old female with palpable {side} breast mass"),
            ("Gross Exam", f"Irregular tan-white tumor, {size} cm, firm"),
            ("Microscopic", f"Invasive {hist} carcinoma, Nottingham grade {grade}{growth}"),
            ("Immunohistochemistry", f"ER: {er_l} ({er_p}%), PR: {pr_l} ({pr_p}%), HER2: {her2_l}"),
            ("Lymph Nodes", f"{nodes_pos} of {nodes_ex} axillary sentinel lymph nodes positive"),
            ("Margins", f"Resection margins {margin}"),
            ("Diagnosis", f"Invasive {hist} carcinoma, grade {grade}, {size} cm, {side} breast"),
        ]
    elif ct == "DCIS":
        ng = random.choice(["intermediate","high"])
        path = [
            ("Clinical History", f"{age}-year-old female, clustered microcalcifications on {side} mammogram"),
            ("Gross Exam", f"Fibrofatty tissue with calcifications, {size} cm span"),
            ("Microscopic", f"Ductal carcinoma in situ, {ng} nuclear grade, no invasion identified"),
            ("Necrosis", "Comedo-type necrosis present" if ng=="high" else "No necrosis"),
            ("Immunohistochemistry", f"ER: {er_l} ({er_p}%), PR: {pr_l} ({pr_p}%)"),
            ("Diagnosis", f"Ductal carcinoma in situ (DCIS), {ng} grade, {side} breast"),
        ]
    elif ct == "Fibroadenoma":
        path = [
            ("Clinical History", f"{age}-year-old female with mobile, non-tender {side} breast mass"),
            ("Gross Exam", f"Well-circumscribed rubbery tan nodule, {size} cm"),
            ("Microscopic", "Benign proliferation of glandular and stromal elements, no atypia"),
            ("Diagnosis", "Fibroadenoma, benign - no evidence of malignancy"),
        ]
    elif ct == "Fibrocystic":
        path = [
            ("Clinical History", f"{age}-year-old female with {side} breast tenderness and lumpiness"),
            ("Gross Exam", "Fibrofatty tissue with scattered small cysts"),
            ("Microscopic", "Fibrocystic changes with apocrine metaplasia, no atypia"),
            ("Diagnosis", "Fibrocystic changes, benign"),
        ]
    elif ct == "BCC_skin":
        path = [
            ("Clinical History", f"{age}-year-old female with a pearly papule on the skin of the {side} breast"),
            ("Gross Exam", f"Skin ellipse with a {size} cm nodular lesion"),
            ("Microscopic", "Basaloid nests with peripheral palisading, arising from epidermis"),
            ("Diagnosis", "Basal cell carcinoma of skin (cutaneous) - not a breast primary"),
        ]
    else:  # ADH (uncertain / borderline)
        path = [
            ("Clinical History", f"{age}-year-old female, {side} breast core biopsy for calcifications"),
            ("Microscopic", "Atypical ductal hyperplasia; cannot exclude low-grade DCIS on this limited sample"),
            ("Recommendation", "Surgical excision recommended for definitive assessment"),
            ("Diagnosis", "Atypical ductal hyperplasia (ADH) - uncertain, excision advised"),
        ]

    malignant = ct in ("IDC","ILC","DCIS")

    clinical = [
        ("Assessment", f"{age}-year-old female evaluated for {side} breast finding"),
        ("History", "Reports a palpable change; denies nipple discharge or prior breast cancer"),
        ("Exam", f"{'Firm irregular' if malignant else 'Mobile discrete'} {side} breast mass; axilla clinically {'suspicious' if nodes_pos else 'negative'}"),
        ("Plan", "Diagnostic imaging and core biopsy" if not malignant else "Multidisciplinary oncology review; staging and treatment planning"),
    ]

    radiology = [
        ("Indication", f"Palpable {side} breast mass, evaluate"),
        ("Technique", "Diagnostic mammography with targeted ultrasound"),
        ("Findings", f"{'Irregular spiculated' if malignant else 'Circumscribed oval'} mass, {size} cm, {side} breast"),
        ("Impression", f"BI-RADS {'4C-5, suspicious' if malignant else '3, probably benign'}; {'biopsy' if malignant else 'short-interval follow-up'}"),
    ]

    operative = [
        ("Indications", f"{side.capitalize()} breast mass requiring tissue diagnosis"),
        ("Procedure", "Ultrasound-guided core needle biopsy" if not malignant else "Lumpectomy with sentinel lymph node biopsy"),
        ("Findings", f"{size} cm {'firm' if malignant else 'rubbery'} lesion"),
        ("Specimen", "Sent to pathology for histologic evaluation"),
        ("Complications", "None"),
    ]

    discharge = [
        ("Summary", f"Admitted for management of {side} breast lesion"),
        ("Hospital Course", "Underwent biopsy/excision without complication"),
        ("Pathology", f"Final pathology: {path[-1][1]}"),
        ("Follow-up", "Oncology follow-up in 1-2 weeks" if malignant else "Routine follow-up with primary care"),
    ]

    # labs: receptor panel only for malignant/in-situ; CBC for everyone
    labs = []
    if malignant:
        labs += [("16112-5","Estrogen Receptor",f"{er_l} ({er_p}%)","IHC","Tissue"),
                 ("16113-3","Progesterone Receptor",f"{pr_l} ({pr_p}%)","IHC","Tissue"),
                 ("48676-1","HER2",her2_l,"IHC","Tissue")]
    labs += [("718-7","Hemoglobin",str(round(random.uniform(11.5,14.5),1)),"g/dL","Blood"),
             ("4544-3","Hematocrit",str(round(random.uniform(35,44),1)),"%","Blood"),
             ("777-3","Platelets",str(random.randint(180,380)),"10^9/L","Blood")]

    # meds: chemo for node+/high-grade invasive; endocrine for ER+ invasive/DCIS
    meds = []
    if ct in ("IDC","ILC") and (nodes_pos > 0 or grade == "III"):
        meds += [("50090088","Doxorubicin","Chemotherapy","IV","Q3 weeks"),
                 ("50090067","Cyclophosphamide","Chemotherapy","IV","Q3 weeks")]
    if malignant and er_l == "Positive":
        endo = ("50091082","Tamoxifen") if age < 52 else ("50090001","Letrozole")
        meds += [(endo[0], endo[1], "Hormone Therapy", "PO", "Daily")]

    return dict(ct=ct, code=code, desc=desc, behavior=behavior, reportable=reportable,
                pid=pid, enc=enc, dob=dob, dxd=dxd, encd=encd, ts=ts,
                first=random.choice(FIRST), last=random.choice(LAST),
                race=random.choice(["White","Black","Asian","Hispanic"]),
                ethnicity=random.choice(["Hispanic","Non-Hispanic"]),
                path=path, clinical=clinical, radiology=radiology, operative=operative,
                discharge=discharge, labs=labs, meds=meds,
                inpatient=(random.random() < 0.35), has_surgery=malignant or random.random() < 0.5,
                has_clinical=(random.random() < 0.85), has_rad=(random.random() < 0.85))

def _dtf(d):  # date -> python date
    return d.date()

def main():
    spark = SparkSession.builder.appName("SyntheticCancerData").getOrCreate()
    # Config via CLI args (serverless-safe; spark.conf.get on custom keys is blocked on Spark Connect).
    # Order: catalog, bronze_schema, num_patients. Defaults keep it runnable standalone.
    catalog = sys.argv[1] if len(sys.argv) > 1 else "cancer_registry_demo"
    schema = sys.argv[2] if len(sys.argv) > 2 else "cancer_bronze"
    N = int(sys.argv[3]) if len(sys.argv) > 3 else 200

    cases = [build_case(i) for i in range(N)]

    patient, encounter, diagnosis = [], [], []
    pathology, clinical, operative, medication, radiology, lab, discharge = [], [], [], [], [], [], []

    for c in cases:
        patient.append(dict(patient_id=c["pid"], mrn=c["pid"].replace("PAT","MRN"),
            first_name=c["first"], last_name=c["last"], date_of_birth=_dtf(c["dob"]),
            sex="F", race=c["race"], ethnicity=c["ethnicity"], active_status="Active",
            deceased_date=None, created_at=c["ts"], updated_at=c["ts"]))
        encounter.append(dict(encounter_id=c["enc"], patient_id=c["pid"], encounter_date=_dtf(c["encd"]),
            encounter_time=c["encd"], discharge_date=(_dtf(c["encd"]+timedelta(days=random.randint(1,4))) if c["inpatient"] else None),
            encounter_type=("Inpatient" if c["inpatient"] else "Office Visit"),
            facility_name=random.choice(["Regional Cancer Center","Teaching Hospital"]), department="Oncology",
            primary_provider=random.choice(["Dr. Johnson","Dr. Smith","Dr. Williams"]),
            admission_source="Direct Admission", created_at=c["ts"], updated_at=c["ts"]))
        diagnosis.append(dict(diagnosis_id=f"DX{c['pid'][3:]}", encounter_id=c["enc"], patient_id=c["pid"],
            diagnosis_code=c["code"], diagnosis_desc=c["desc"], diagnosis_date=_dtf(c["dxd"]),
            diagnosis_sequence=1, behavior=str(c["behavior"]), status="Active",
            created_at=c["ts"], updated_at=c["ts"]))

        rd = c["dxd"]
        pid_path = f"PATH{c['pid'][3:]}"
        for ln,(sec,txt) in enumerate(c["path"],1):
            pathology.append(dict(pathology_id=pid_path, patient_id=c["pid"], encounter_id=c["enc"],
                line_id=ln, report_section=sec, text_line=txt, specimen_number=f"S{c['pid'][3:]}",
                accession_number=f"A{c['pid'][3:]}", provider_name=random.choice(["Dr. Pathologist A","Dr. Pathologist B"]),
                report_date=_dtf(rd), signed_date=(rd+timedelta(days=1)).timestamp(), status="Final",
                created_at=c["ts"], updated_at=c["ts"]))

        if c["has_clinical"]:
            nid=f"NOTE{c['pid'][3:]}"
            for ln,(sec,txt) in enumerate(c["clinical"],1):
                clinical.append(dict(note_id=nid, patient_id=c["pid"], encounter_id=c["enc"], line_id=ln,
                    note_type="Oncology Consult", text_line=txt, provider_name="Dr. Oncologist",
                    note_date=_dtf(rd), signed_date=(rd+timedelta(days=1)).timestamp(), status="Signed",
                    created_at=c["ts"], updated_at=c["ts"]))

        if c["has_surgery"]:
            oid=f"OP{c['pid'][3:]}"
            for ln,(sec,txt) in enumerate(c["operative"],1):
                operative.append(dict(operative_note_id=oid, patient_id=c["pid"], encounter_id=c["enc"], line_id=ln,
                    procedure_code=("19301" if c["ct"] in ("IDC","ILC") else "19083"),
                    procedure_desc=("Lumpectomy" if c["ct"] in ("IDC","ILC") else "Core needle biopsy"),
                    section=sec, text_line=txt, surgeon_name=random.choice(["Dr. Surgeon A","Dr. Surgeon B"]),
                    operative_date=_dtf(rd), signed_date=(rd+timedelta(days=1)).timestamp(), status="Final",
                    created_at=c["ts"], updated_at=c["ts"]))

        if c["has_rad"]:
            rid=f"RAD{c['pid'][3:]}"
            for ln,(sec,txt) in enumerate(c["radiology"],1):
                radiology.append(dict(radiology_id=rid, patient_id=c["pid"], encounter_id=c["enc"], line_id=ln,
                    exam_type="Mammography", anatomy="Bilateral Breast", section=sec, text_line=txt,
                    radiologist_name=random.choice(["Dr. Radiologist A","Dr. Radiologist B"]),
                    exam_date=_dtf(rd), signed_date=(rd+timedelta(days=1)).timestamp(), status="Final",
                    created_at=c["ts"], updated_at=c["ts"]))

        if c["inpatient"]:
            did=f"DISCH{c['pid'][3:]}"
            for ln,(sec,txt) in enumerate(c["discharge"],1):
                discharge.append(dict(discharge_id=did, patient_id=c["pid"], encounter_id=c["enc"], line_id=ln,
                    section=sec, text_line=txt, discharge_date=_dtf(c["encd"]+timedelta(days=2)),
                    signed_date=(c["encd"]+timedelta(days=2)).timestamp(), status="Final",
                    created_at=c["ts"], updated_at=c["ts"]))

        for j,(code,name,val,unit,spec) in enumerate(c["labs"]):
            lab.append(dict(lab_id=f"LAB{c['pid'][3:]}_{j}", patient_id=c["pid"], encounter_id=c["enc"],
                test_code=code, test_name=name, result_value=val, result_unit=unit, reference_range="Variable",
                result_date=_dtf(rd), specimen_type=spec, status="Final", created_at=c["ts"], updated_at=c["ts"]))

        for k,(code,name,mtype,route,freq) in enumerate(c["meds"]):
            sd=c["dxd"]+timedelta(days=random.randint(14,40))
            medication.append(dict(order_id=f"MED{c['pid'][3:]}_{k}", patient_id=c["pid"], encounter_id=c["enc"],
                medication_code=code, medication_name=name, medication_type=mtype,
                dose=random.choice(["500mg","250mg","100mg","20mg"]), frequency=freq, route=route,
                start_date=_dtf(sd), end_date=_dtf(sd+timedelta(days=random.randint(60,180))),
                status="Active", order_date=sd.timestamp(), created_at=c["ts"], updated_at=c["ts"]))

    def write(rows, name, schema_ddl):
        spark.createDataFrame(rows, schema=schema_ddl).write.mode("overwrite").format("delta") \
            .saveAsTable(f"{catalog}.{schema}.{name}")
        return len(rows)

    counts = {}
    counts["patient"] = write(patient, "patient",
        "patient_id STRING, mrn STRING, first_name STRING, last_name STRING, date_of_birth DATE, sex STRING, race STRING, ethnicity STRING, active_status STRING, deceased_date TIMESTAMP, created_at TIMESTAMP, updated_at TIMESTAMP")
    counts["encounter"] = write(encounter, "encounter",
        "encounter_id STRING, patient_id STRING, encounter_date DATE, encounter_time TIMESTAMP, discharge_date DATE, encounter_type STRING, facility_name STRING, department STRING, primary_provider STRING, admission_source STRING, created_at TIMESTAMP, updated_at TIMESTAMP")
    counts["diagnosis"] = write(diagnosis, "diagnosis",
        "diagnosis_id STRING, encounter_id STRING, patient_id STRING, diagnosis_code STRING, diagnosis_desc STRING, diagnosis_date DATE, diagnosis_sequence INT, behavior STRING, status STRING, created_at TIMESTAMP, updated_at TIMESTAMP")
    counts["pathology_report_text"] = write(pathology, "pathology_report_text",
        "pathology_id STRING, patient_id STRING, encounter_id STRING, line_id INT, report_section STRING, text_line STRING, specimen_number STRING, accession_number STRING, provider_name STRING, report_date DATE, signed_date DOUBLE, status STRING, created_at TIMESTAMP, updated_at TIMESTAMP")
    counts["clinical_note"] = write(clinical, "clinical_note",
        "note_id STRING, patient_id STRING, encounter_id STRING, line_id INT, note_type STRING, text_line STRING, provider_name STRING, note_date DATE, signed_date DOUBLE, status STRING, created_at TIMESTAMP, updated_at TIMESTAMP")
    counts["operative_note"] = write(operative, "operative_note",
        "operative_note_id STRING, patient_id STRING, encounter_id STRING, line_id INT, procedure_code STRING, procedure_desc STRING, section STRING, text_line STRING, surgeon_name STRING, operative_date DATE, signed_date DOUBLE, status STRING, created_at TIMESTAMP, updated_at TIMESTAMP")
    counts["medication_order"] = write(medication, "medication_order",
        "order_id STRING, patient_id STRING, encounter_id STRING, medication_code STRING, medication_name STRING, medication_type STRING, dose STRING, frequency STRING, route STRING, start_date DATE, end_date DATE, status STRING, order_date DOUBLE, created_at TIMESTAMP, updated_at TIMESTAMP")
    counts["radiology_report_text"] = write(radiology, "radiology_report_text",
        "radiology_id STRING, patient_id STRING, encounter_id STRING, line_id INT, exam_type STRING, anatomy STRING, section STRING, text_line STRING, radiologist_name STRING, exam_date DATE, signed_date DOUBLE, status STRING, created_at TIMESTAMP, updated_at TIMESTAMP")
    counts["lab_result"] = write(lab, "lab_result",
        "lab_id STRING, patient_id STRING, encounter_id STRING, test_code STRING, test_name STRING, result_value STRING, result_unit STRING, reference_range STRING, result_date DATE, specimen_type STRING, status STRING, created_at TIMESTAMP, updated_at TIMESTAMP")
    counts["discharge_summary"] = write(discharge, "discharge_summary",
        "discharge_id STRING, patient_id STRING, encounter_id STRING, line_id INT, section STRING, text_line STRING, discharge_date DATE, signed_date DOUBLE, status STRING, created_at TIMESTAMP, updated_at TIMESTAMP")

    rep = sum(1 for c in cases if c["reportable"])
    print("Row counts:", counts)
    print(f"Cases: {len(cases)} | reportable(breast /2,/3): {rep} | non-reportable: {len(cases)-rep}")
    print("Case-type distribution:", {ct: sum(1 for c in cases if c['ct']==ct) for ct,_ in CASE_WEIGHTS})

if __name__ == "__main__":
    main()
