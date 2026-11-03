/**
 * NAACCR data dictionary (demo subset, breast-cancer focused).
 *
 * This is the data-driven field set. The UI never hard-codes any field: it
 * renders whatever sections/fields the dictionary produces. Swapping this array
 * for the full 300+ item NAACCR dictionary requires NO UI changes — exactly the
 * contract requirement (naaccr_field_model.md: "data-driven, not hand-coded").
 *
 * Each entry also carries a `demo` block = the simulated abstraction-agent output
 * (value + confidence + field_status + source_ref) so the mock renders a realistic
 * pre-filled draft. Per-case demographics are overlaid in buildForm().
 */
import type {
  FieldDataType,
  FieldStatus,
  SourceRef,
  ValidValue,
} from '@/types/api';
import { IS_STATIC_DEMO } from '@/lib/demo';

export interface DictEntry {
  naaccr_item_id: number;
  item_name: string;
  label: string;
  section: string;
  data_type: FieldDataType;
  required: boolean;
  valid_values: ValidValue[] | null;
  unknown_code: string | null;
  description?: string;
  /** Searchable code-lookup system (public demo build only, see below). */
  lookup?: string;
  demo: {
    value: string | null;
    confidence: number | null;
    status: FieldStatus;
    source?: SourceRef | null;
  };
}

// ---- reusable code sets --------------------------------------------------
const SEX: ValidValue[] = [
  { code: '1', label: 'Male' },
  { code: '2', label: 'Female' },
  { code: '9', label: 'Unknown' },
];
const RACE: ValidValue[] = [
  { code: '01', label: 'White' },
  { code: '02', label: 'Black' },
  { code: '03', label: 'American Indian / Alaska Native' },
  { code: '04', label: 'Chinese' },
  { code: '05', label: 'Japanese' },
  { code: '08', label: 'Korean' },
  { code: '10', label: 'Vietnamese' },
  { code: '15', label: 'Asian Indian / Pakistani' },
  { code: '96', label: 'Other Asian' },
  { code: '98', label: 'Other' },
  { code: '99', label: 'Unknown' },
];
const HISPANIC: ValidValue[] = [
  { code: '0', label: 'Non-Spanish / Non-Hispanic' },
  { code: '1', label: 'Mexican' },
  { code: '2', label: 'Puerto Rican' },
  { code: '3', label: 'Cuban' },
  { code: '6', label: 'Spanish, NOS' },
  { code: '9', label: 'Unknown' },
];
const STATE: ValidValue[] = [
  { code: 'IN', label: 'Indiana' },
  { code: 'OH', label: 'Ohio' },
  { code: 'MI', label: 'Michigan' },
  { code: 'IL', label: 'Illinois' },
  { code: 'KY', label: 'Kentucky' },
  { code: 'ZZ', label: 'Unknown' },
];
const MARITAL: ValidValue[] = [
  { code: '1', label: 'Single (never married)' },
  { code: '2', label: 'Married' },
  { code: '3', label: 'Separated' },
  { code: '4', label: 'Divorced' },
  { code: '5', label: 'Widowed' },
  { code: '6', label: 'Unmarried / domestic partner' },
  { code: '9', label: 'Unknown' },
];
const PRIMARY_SITE: ValidValue[] = [
  { code: 'C50.0', label: 'Nipple' },
  { code: 'C50.1', label: 'Central portion of breast' },
  { code: 'C50.2', label: 'Upper-inner quadrant' },
  { code: 'C50.3', label: 'Lower-inner quadrant' },
  { code: 'C50.4', label: 'Upper-outer quadrant' },
  { code: 'C50.5', label: 'Lower-outer quadrant' },
  { code: 'C50.8', label: 'Overlapping lesion of breast' },
  { code: 'C50.9', label: 'Breast, NOS' },
];
const LATERALITY: ValidValue[] = [
  { code: '0', label: 'Not a paired site' },
  { code: '1', label: 'Right: origin of primary' },
  { code: '2', label: 'Left: origin of primary' },
  { code: '3', label: 'Only one side, unspecified' },
  { code: '4', label: 'Bilateral' },
  { code: '9', label: 'Paired site, unknown' },
];
const HISTOLOGY: ValidValue[] = [
  { code: '8500/3', label: 'Infiltrating duct carcinoma, NST' },
  { code: '8520/3', label: 'Lobular carcinoma, NOS' },
  { code: '8522/3', label: 'Infiltrating duct and lobular carcinoma' },
  { code: '8480/3', label: 'Mucinous adenocarcinoma' },
  { code: '8501/3', label: 'Comedocarcinoma, NOS' },
  { code: '8503/2', label: 'Intraductal papillary carcinoma (in situ)' },
  { code: '8500/2', label: 'Intraductal carcinoma (DCIS)' },
  { code: '8010/3', label: 'Carcinoma, NOS' },
];
const BEHAVIOR: ValidValue[] = [
  { code: '2', label: 'In situ' },
  { code: '3', label: 'Malignant, primary (invasive)' },
];
const GRADE: ValidValue[] = [
  { code: '1', label: 'Grade I (well differentiated)' },
  { code: '2', label: 'Grade II (moderately differentiated)' },
  { code: '3', label: 'Grade III (poorly differentiated)' },
  { code: '4', label: 'Grade IV (undifferentiated)' },
  { code: '9', label: 'Unknown / not determined' },
];
const DX_CONF: ValidValue[] = [
  { code: '1', label: 'Positive histology' },
  { code: '2', label: 'Positive cytology' },
  { code: '4', label: 'Positive microscopic confirmation, method NOS' },
  { code: '5', label: 'Positive laboratory test / marker' },
  { code: '8', label: 'Clinical diagnosis only' },
  { code: '9', label: 'Unknown if microscopically confirmed' },
];
const SEQ: ValidValue[] = [
  { code: '00', label: 'One primary only' },
  { code: '01', label: 'First of 2+ primaries' },
  { code: '02', label: 'Second of 2+ primaries' },
  { code: '99', label: 'Unspecified / unknown' },
];
const TNM_T: ValidValue[] = [
  { code: 'Tis', label: 'Tis (in situ)' },
  { code: 'T1', label: 'T1' },
  { code: 'T1c', label: 'T1c' },
  { code: 'T2', label: 'T2' },
  { code: 'T3', label: 'T3' },
  { code: 'T4', label: 'T4' },
  { code: 'TX', label: 'TX (cannot be assessed)' },
];
const TNM_N: ValidValue[] = [
  { code: 'N0', label: 'N0' },
  { code: 'N1', label: 'N1' },
  { code: 'N1a', label: 'N1a' },
  { code: 'N2', label: 'N2' },
  { code: 'N3', label: 'N3' },
  { code: 'NX', label: 'NX (cannot be assessed)' },
];
const TNM_M: ValidValue[] = [
  { code: 'M0', label: 'M0' },
  { code: 'M1', label: 'M1' },
  { code: 'cM0(i+)', label: 'cM0(i+)' },
];
const SUMMARY_STAGE: ValidValue[] = [
  { code: '0', label: 'In situ' },
  { code: '1', label: 'Localized' },
  { code: '2', label: 'Regional, direct extension' },
  { code: '3', label: 'Regional, lymph nodes' },
  { code: '4', label: 'Regional, extension + nodes' },
  { code: '7', label: 'Distant' },
  { code: '9', label: 'Unknown / unstaged' },
];
const MARKER: ValidValue[] = [
  { code: '0', label: 'Negative / not expressed' },
  { code: '1', label: 'Positive / expressed' },
  { code: '7', label: 'Test ordered, results not in chart' },
  { code: '8', label: 'Not applicable' },
  { code: '9', label: 'Unknown / no information' },
];
const HER2_IHC: ValidValue[] = [
  { code: '0', label: '0 (negative)' },
  { code: '1', label: '1+ (negative)' },
  { code: '2', label: '2+ (equivocal)' },
  { code: '3', label: '3+ (positive)' },
  { code: '9', label: 'Unknown' },
];
const SURG_PRIM: ValidValue[] = [
  { code: '00', label: 'None; no surgery of primary site' },
  { code: '20', label: 'Partial mastectomy / lumpectomy' },
  { code: '30', label: 'Subcutaneous mastectomy' },
  { code: '41', label: 'Total (simple) mastectomy' },
  { code: '51', label: 'Modified radical mastectomy' },
  { code: '90', label: 'Surgery, NOS' },
  { code: '99', label: 'Unknown' },
];
const SCOPE_LN: ValidValue[] = [
  { code: '0', label: 'None' },
  { code: '1', label: 'Biopsy / aspiration of regional node' },
  { code: '2', label: 'Sentinel lymph node biopsy' },
  { code: '5', label: 'SLN biopsy + dissection (same time)' },
  { code: '6', label: '4 or more regional nodes removed' },
  { code: '9', label: 'Unknown' },
];
const RADIATION: ValidValue[] = [
  { code: '0', label: 'None' },
  { code: '1', label: 'Beam radiation' },
  { code: '2', label: 'Radioactive implants / brachytherapy' },
  { code: '9', label: 'Unknown' },
];
const CHEMO: ValidValue[] = [
  { code: '00', label: 'None' },
  { code: '02', label: 'Single-agent chemotherapy' },
  { code: '03', label: 'Multi-agent chemotherapy' },
  { code: '99', label: 'Unknown' },
];
const HORMONE: ValidValue[] = [
  { code: '00', label: 'None' },
  { code: '01', label: 'Hormone therapy administered' },
  { code: '99', label: 'Unknown' },
];
const BRM: ValidValue[] = [
  { code: '00', label: 'None' },
  { code: '01', label: 'Immunotherapy / BRM administered' },
  { code: '99', label: 'Unknown' },
];
const VITAL: ValidValue[] = [
  { code: '0', label: 'Dead' },
  { code: '1', label: 'Alive' },
];
const CANCER_STATUS: ValidValue[] = [
  { code: '1', label: 'No evidence of this tumor' },
  { code: '2', label: 'Evidence of this tumor' },
  { code: '9', label: 'Unknown / not stated' },
];

const S = (doc_id: string, section: string, quote: string): SourceRef => ({
  doc_id,
  section,
  quote,
});

export const SECTIONS_ORDER = [
  'Demographics',
  'Tumor Identification',
  'Stage/Extent',
  'Site-Specific Data Items (SSDIs)',
  'First-Course Treatment',
  'Follow-up/Outcomes',
];

export const DICTIONARY: DictEntry[] = [
  // ---------------------------------------------------------------- Demographics
  {
    naaccr_item_id: 2230, item_name: 'nameLast', label: 'Name--Last',
    section: 'Demographics', data_type: 'text', required: true,
    valid_values: null, unknown_code: null,
    description: 'Patient last name at diagnosis.',
    demo: { value: 'PLACEHOLDER', confidence: 0.99, status: 'ai_suggested', source: S('reg-01', 'registration', 'Patient registration record.') },
  },
  {
    naaccr_item_id: 2240, item_name: 'nameFirst', label: 'Name--First',
    section: 'Demographics', data_type: 'text', required: true,
    valid_values: null, unknown_code: null,
    demo: { value: 'PLACEHOLDER', confidence: 0.99, status: 'ai_suggested', source: S('reg-01', 'registration', 'Patient registration record.') },
  },
  {
    naaccr_item_id: 20, item_name: 'patientIdNumber', label: 'Patient ID Number (MRN)',
    section: 'Demographics', data_type: 'text', required: true,
    valid_values: null, unknown_code: null,
    demo: { value: 'PLACEHOLDER', confidence: 1.0, status: 'ai_suggested', source: S('reg-01', 'registration', 'EMR medical record number.') },
  },
  {
    naaccr_item_id: 240, item_name: 'dateOfBirth', label: 'Date of Birth',
    section: 'Demographics', data_type: 'date', required: true,
    valid_values: null, unknown_code: null,
    demo: { value: 'PLACEHOLDER', confidence: 1.0, status: 'ai_suggested', source: S('reg-01', 'registration', 'EMR demographics.') },
  },
  {
    naaccr_item_id: 220, item_name: 'sex', label: 'Sex',
    section: 'Demographics', data_type: 'coded', required: true,
    valid_values: SEX, unknown_code: '9',
    demo: { value: 'PLACEHOLDER', confidence: 1.0, status: 'ai_suggested', source: S('reg-01', 'registration', 'EMR demographics.') },
  },
  {
    naaccr_item_id: 160, item_name: 'race1', label: 'Race 1',
    section: 'Demographics', data_type: 'coded', required: true,
    valid_values: RACE, unknown_code: '99',
    demo: { value: '01', confidence: 0.47, status: 'ai_suggested', source: S('reg-01', 'registration', 'Self-reported race field partially populated.') },
  },
  {
    naaccr_item_id: 190, item_name: 'spanishHispanicOrigin', label: 'Spanish / Hispanic Origin',
    section: 'Demographics', data_type: 'coded', required: true,
    valid_values: HISPANIC, unknown_code: '9',
    demo: { value: '0', confidence: 0.72, status: 'ai_suggested', source: S('reg-01', 'registration', 'Ethnicity per registration.') },
  },
  {
    naaccr_item_id: 80, item_name: 'addrAtDxState', label: 'Addr at DX--State',
    section: 'Demographics', data_type: 'coded', required: false,
    valid_values: STATE, unknown_code: 'ZZ',
    demo: { value: 'IN', confidence: 0.95, status: 'ai_suggested', source: S('reg-01', 'registration', 'Address of residence at diagnosis.') },
  },
  {
    naaccr_item_id: 150, item_name: 'maritalStatusAtDx', label: 'Marital Status at DX',
    section: 'Demographics', data_type: 'coded', required: false,
    valid_values: MARITAL, unknown_code: '9',
    demo: { value: '2', confidence: 0.38, status: 'ai_suggested', source: S('hx-04', 'social history', 'Social history mentions spouse.') },
  },

  // -------------------------------------------------------- Tumor Identification
  {
    naaccr_item_id: 390, item_name: 'dateOfDiagnosis', label: 'Date of Diagnosis',
    section: 'Tumor Identification', data_type: 'date', required: true,
    valid_values: null, unknown_code: null,
    demo: { value: 'PLACEHOLDER', confidence: 0.99, status: 'ai_suggested', source: S('path-77', 'final diagnosis', 'Specimen collected; malignancy confirmed on this date.') },
  },
  {
    naaccr_item_id: 400, item_name: 'primarySite', label: 'Primary Site',
    section: 'Tumor Identification', data_type: 'coded', required: true,
    valid_values: PRIMARY_SITE, unknown_code: null,
    description: 'Topography (ICD-O-3) of the primary tumor.',
    demo: { value: 'C50.9', confidence: 0.97, status: 'ai_suggested', source: S('path-77', 'gross', 'Breast tissue, right, containing a firm mass.') },
  },
  {
    naaccr_item_id: 410, item_name: 'laterality', label: 'Laterality',
    section: 'Tumor Identification', data_type: 'coded', required: true,
    valid_values: LATERALITY, unknown_code: '9',
    demo: { value: '1', confidence: 0.95, status: 'ai_suggested', source: S('path-77', 'gross', 'Right breast lumpectomy specimen.') },
  },
  {
    naaccr_item_id: 522, item_name: 'histologicTypeIcdO3', label: 'Histologic Type ICD-O-3',
    section: 'Tumor Identification', data_type: 'coded', required: true,
    valid_values: HISTOLOGY, unknown_code: null,
    demo: { value: '8500/3', confidence: 0.93, status: 'ai_suggested', source: S('path-77', 'microscopic', 'Invasive ductal carcinoma, no special type.') },
  },
  {
    naaccr_item_id: 523, item_name: 'behaviorCodeIcdO3', label: 'Behavior Code ICD-O-3',
    section: 'Tumor Identification', data_type: 'coded', required: true,
    valid_values: BEHAVIOR, unknown_code: null,
    demo: { value: '3', confidence: 0.9, status: 'ai_suggested', source: S('path-77', 'microscopic', 'Invasive carcinoma identified.') },
  },
  {
    naaccr_item_id: 440, item_name: 'grade', label: 'Grade / Differentiation',
    section: 'Tumor Identification', data_type: 'coded', required: false,
    valid_values: GRADE, unknown_code: '9',
    demo: { value: '2', confidence: 0.72, status: 'ai_suggested', source: S('path-77', 'microscopic', 'Nottingham grade 2 (tubule 3, nuclear 2, mitotic 1).') },
  },
  {
    naaccr_item_id: 545, item_name: 'diagnosticConfirmation', label: 'Diagnostic Confirmation',
    section: 'Tumor Identification', data_type: 'coded', required: true,
    valid_values: DX_CONF, unknown_code: '9',
    description: 'How the reportable diagnosis was confirmed. Required.',
    demo: { value: null, confidence: null, status: 'blank', source: null },
  },
  {
    naaccr_item_id: 500, item_name: 'sequenceNumberCentral', label: 'Sequence Number--Central',
    section: 'Tumor Identification', data_type: 'coded', required: false,
    valid_values: SEQ, unknown_code: '99',
    demo: { value: '00', confidence: 0.8, status: 'ai_suggested', source: null },
  },

  // ------------------------------------------------------------- Stage / Extent
  {
    naaccr_item_id: 880, item_name: 'tumorSizeSummary', label: 'Tumor Size Summary (mm)',
    section: 'Stage/Extent', data_type: 'numeric', required: false,
    valid_values: null, unknown_code: '999',
    description: 'Largest dimension of the primary tumor in millimetres.',
    demo: { value: null, confidence: null, status: 'blank', source: null },
  },
  {
    naaccr_item_id: 820, item_name: 'regionalNodesPositive', label: 'Regional Nodes Positive',
    section: 'Stage/Extent', data_type: 'numeric', required: true,
    valid_values: null, unknown_code: '99',
    demo: { value: '3', confidence: 0.86, status: 'ai_suggested', source: S('path-77', 'lymph nodes', '3 of 12 axillary nodes positive for metastatic carcinoma.') },
  },
  {
    naaccr_item_id: 830, item_name: 'regionalNodesExamined', label: 'Regional Nodes Examined',
    section: 'Stage/Extent', data_type: 'numeric', required: true,
    valid_values: null, unknown_code: '99',
    description: 'Total number of regional nodes examined. Required when nodes are positive.',
    demo: { value: null, confidence: null, status: 'blank', source: null },
  },
  {
    naaccr_item_id: 1001, item_name: 'ajccTnmClinT', label: 'AJCC TNM Clin T',
    section: 'Stage/Extent', data_type: 'coded', required: false,
    valid_values: TNM_T, unknown_code: null,
    demo: { value: 'T2', confidence: 0.7, status: 'ai_suggested', source: S('note-12', 'oncology consult', 'Clinically ~2.5 cm mobile mass.') },
  },
  {
    naaccr_item_id: 1002, item_name: 'ajccTnmClinN', label: 'AJCC TNM Clin N',
    section: 'Stage/Extent', data_type: 'coded', required: false,
    valid_values: TNM_N, unknown_code: null,
    demo: { value: 'N1', confidence: 0.66, status: 'ai_suggested', source: S('note-12', 'oncology consult', 'Palpable mobile axillary node.') },
  },
  {
    naaccr_item_id: 1003, item_name: 'ajccTnmClinM', label: 'AJCC TNM Clin M',
    section: 'Stage/Extent', data_type: 'coded', required: false,
    valid_values: TNM_M, unknown_code: null,
    demo: { value: 'M0', confidence: 0.83, status: 'ai_suggested', source: null },
  },
  {
    naaccr_item_id: 1011, item_name: 'ajccTnmPathT', label: 'AJCC TNM Path T',
    section: 'Stage/Extent', data_type: 'coded', required: false,
    valid_values: TNM_T, unknown_code: null,
    demo: { value: 'T2', confidence: 0.88, status: 'ai_suggested', source: S('path-77', 'synoptic', 'pT2: tumor 24 mm in greatest dimension.') },
  },
  {
    naaccr_item_id: 1012, item_name: 'ajccTnmPathN', label: 'AJCC TNM Path N',
    section: 'Stage/Extent', data_type: 'coded', required: false,
    valid_values: TNM_N, unknown_code: null,
    demo: { value: 'N1a', confidence: 0.68, status: 'ai_suggested', source: S('path-77', 'synoptic', 'pN1a: 3 positive axillary nodes.') },
  },
  {
    naaccr_item_id: 1013, item_name: 'ajccTnmPathM', label: 'AJCC TNM Path M',
    section: 'Stage/Extent', data_type: 'coded', required: false,
    valid_values: TNM_M, unknown_code: null,
    demo: { value: 'M0', confidence: 0.8, status: 'ai_suggested', source: null },
  },
  {
    naaccr_item_id: 970, item_name: 'summaryStage2018', label: 'Summary Stage 2018',
    section: 'Stage/Extent', data_type: 'coded', required: false,
    valid_values: SUMMARY_STAGE, unknown_code: '9',
    demo: { value: '3', confidence: 0.64, status: 'ai_suggested', source: S('path-77', 'synoptic', 'Regional nodal involvement present.') },
  },

  // ----------------------------------------------- Site-Specific Data (SSDIs)
  {
    naaccr_item_id: 3827, item_name: 'erSummary', label: 'Estrogen Receptor (ER) Summary',
    section: 'Site-Specific Data Items (SSDIs)', data_type: 'coded', required: false,
    valid_values: MARKER, unknown_code: '9',
    demo: { value: '1', confidence: 0.9, status: 'ai_suggested', source: S('path-78', 'biomarker addendum', 'ER: Positive, 95% nuclear staining.') },
  },
  {
    naaccr_item_id: 3828, item_name: 'prSummary', label: 'Progesterone Receptor (PR) Summary',
    section: 'Site-Specific Data Items (SSDIs)', data_type: 'coded', required: false,
    valid_values: MARKER, unknown_code: '9',
    demo: { value: '1', confidence: 0.87, status: 'ai_suggested', source: S('path-78', 'biomarker addendum', 'PR: Positive, 80% nuclear staining.') },
  },
  {
    naaccr_item_id: 3855, item_name: 'her2OverallSummary', label: 'HER2 Overall Summary',
    section: 'Site-Specific Data Items (SSDIs)', data_type: 'coded', required: false,
    valid_values: MARKER, unknown_code: '9',
    demo: { value: '0', confidence: 0.82, status: 'ai_suggested', source: S('path-78', 'biomarker addendum', 'HER2 IHC 1+, not amplified by ISH.') },
  },
  {
    naaccr_item_id: 3854, item_name: 'her2IhcSummary', label: 'HER2 IHC Summary',
    section: 'Site-Specific Data Items (SSDIs)', data_type: 'coded', required: false,
    valid_values: HER2_IHC, unknown_code: '9',
    demo: { value: '1', confidence: 0.79, status: 'ai_suggested', source: S('path-78', 'biomarker addendum', 'HER2 IHC score 1+.') },
  },
  {
    naaccr_item_id: 3851, item_name: 'her2IshSummary', label: 'HER2 ISH Summary',
    section: 'Site-Specific Data Items (SSDIs)', data_type: 'coded', required: false,
    valid_values: MARKER, unknown_code: '9',
    demo: { value: '0', confidence: 0.41, status: 'ai_suggested', source: S('path-78', 'biomarker addendum', 'ISH ratio ambiguous; reflex testing noted.') },
  },
  {
    naaccr_item_id: 3843, item_name: 'oncotypeDxRecurrenceScore', label: 'Oncotype DX Recurrence Score',
    section: 'Site-Specific Data Items (SSDIs)', data_type: 'numeric', required: false,
    valid_values: null, unknown_code: 'XXX',
    demo: { value: '18', confidence: 0.55, status: 'ai_suggested', source: S('note-31', 'oncology note', 'Oncotype DX recurrence score reported as 18.') },
  },
  {
    naaccr_item_id: 3800, item_name: 'ki67', label: 'Ki-67 (%)',
    section: 'Site-Specific Data Items (SSDIs)', data_type: 'numeric', required: false,
    valid_values: null, unknown_code: null,
    demo: { value: '22', confidence: 0.6, status: 'ai_suggested', source: S('path-78', 'biomarker addendum', 'Ki-67 proliferation index approximately 22%.') },
  },

  // ------------------------------------------------- First-Course Treatment
  {
    naaccr_item_id: 1290, item_name: 'rxSummSurgPrimSite', label: 'RX Summ--Surg Prim Site',
    section: 'First-Course Treatment', data_type: 'coded', required: true,
    valid_values: SURG_PRIM, unknown_code: '99',
    demo: { value: '20', confidence: 0.84, status: 'ai_suggested', source: S('op-19', 'operative report', 'Right partial mastectomy performed.') },
  },
  {
    naaccr_item_id: 1292, item_name: 'rxSummScopeRegLnSur', label: 'RX Summ--Scope Reg LN Sur',
    section: 'First-Course Treatment', data_type: 'coded', required: false,
    valid_values: SCOPE_LN, unknown_code: '9',
    demo: { value: '2', confidence: 0.78, status: 'ai_suggested', source: S('op-19', 'operative report', 'Sentinel lymph node biopsy performed.') },
  },
  {
    naaccr_item_id: 3170, item_name: 'rxDateSurgery', label: 'RX Date--Surgery',
    section: 'First-Course Treatment', data_type: 'date', required: false,
    valid_values: null, unknown_code: null,
    demo: { value: 'PLACEHOLDER', confidence: 0.9, status: 'ai_suggested', source: S('op-19', 'operative report', 'Date of definitive surgery.') },
  },
  {
    naaccr_item_id: 1360, item_name: 'rxSummRadiation', label: 'RX Summ--Radiation',
    section: 'First-Course Treatment', data_type: 'coded', required: false,
    valid_values: RADIATION, unknown_code: '9',
    demo: { value: '1', confidence: 0.58, status: 'ai_suggested', source: S('note-44', 'radiation oncology', 'Adjuvant whole-breast radiation planned.') },
  },
  {
    naaccr_item_id: 1390, item_name: 'rxSummChemo', label: 'RX Summ--Chemotherapy',
    section: 'First-Course Treatment', data_type: 'coded', required: false,
    valid_values: CHEMO, unknown_code: '99',
    demo: { value: '03', confidence: 0.61, status: 'ai_suggested', source: S('note-31', 'oncology note', 'Plan for adjuvant multi-agent chemotherapy.') },
  },
  {
    naaccr_item_id: 1400, item_name: 'rxSummHormone', label: 'RX Summ--Hormone Therapy',
    section: 'First-Course Treatment', data_type: 'coded', required: false,
    valid_values: HORMONE, unknown_code: '99',
    demo: { value: '01', confidence: 0.74, status: 'ai_suggested', source: S('note-31', 'oncology note', 'ER-positive; endocrine therapy recommended.') },
  },
  {
    naaccr_item_id: 1410, item_name: 'rxSummBrmImmuno', label: 'RX Summ--BRM / Immunotherapy',
    section: 'First-Course Treatment', data_type: 'coded', required: false,
    valid_values: BRM, unknown_code: '99',
    demo: { value: '00', confidence: 0.69, status: 'ai_suggested', source: null },
  },

  // ----------------------------------------------------- Follow-up / Outcomes
  {
    naaccr_item_id: 1750, item_name: 'dateOfLastContact', label: 'Date of Last Contact',
    section: 'Follow-up/Outcomes', data_type: 'date', required: true,
    valid_values: null, unknown_code: null,
    demo: { value: 'PLACEHOLDER', confidence: 0.92, status: 'ai_suggested', source: S('enc-90', 'encounter', 'Most recent documented clinical contact.') },
  },
  {
    naaccr_item_id: 1760, item_name: 'vitalStatus', label: 'Vital Status',
    section: 'Follow-up/Outcomes', data_type: 'coded', required: true,
    valid_values: VITAL, unknown_code: null,
    demo: { value: '1', confidence: 0.98, status: 'ai_suggested', source: S('enc-90', 'encounter', 'Patient alive at last contact.') },
  },
  {
    naaccr_item_id: 1770, item_name: 'cancerStatus', label: 'Cancer Status',
    section: 'Follow-up/Outcomes', data_type: 'coded', required: false,
    valid_values: CANCER_STATUS, unknown_code: '9',
    demo: { value: '1', confidence: 0.63, status: 'ai_suggested', source: S('enc-90', 'encounter', 'No evidence of disease at last follow-up.') },
  },
  {
    naaccr_item_id: 1782, item_name: 'recurrenceDateFirst', label: 'Recurrence Date--1st',
    section: 'Follow-up/Outcomes', data_type: 'date', required: false,
    valid_values: null, unknown_code: null,
    demo: { value: null, confidence: null, status: 'blank', source: null },
  },
  {
    naaccr_item_id: 1910, item_name: 'causeOfDeath', label: 'Cause of Death',
    section: 'Follow-up/Outcomes', data_type: 'text', required: false,
    valid_values: null, unknown_code: null,
    description: 'ICD cause of death; leave blank if patient is alive.',
    demo: { value: null, confidence: null, status: 'blank', source: null },
  },
];

// Public demo build only: add one field backed by a searchable code lookup (the
// real backend does this for FIPS county), so the typeahead is reachable in the
// hosted demo. Removed entirely from the default build.
if (IS_STATIC_DEMO) {
  DICTIONARY.splice(DICTIONARY.findIndex((d) => d.naaccr_item_id === 80) + 1, 0, {
    naaccr_item_id: 90, item_name: 'countyAtDx', label: 'County at DX',
    section: 'Demographics', data_type: 'coded', required: false,
    valid_values: null, unknown_code: '999', lookup: 'fips_county',
    description: 'FIPS county code of residence at diagnosis.',
    demo: { value: null, confidence: null, status: 'blank', source: null },
  });
}

export const FIELDS_TOTAL = DICTIONARY.length;
