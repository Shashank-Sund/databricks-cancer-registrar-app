/** Queue fixtures: 15 flagged breast-cancer cases with varied scores/labels. */
import type { QueueItem } from '@/types/api';

export const QUEUE_SEED: QueueItem[] = [
  {
    case_id: 'C-0001', patient_mrn: 'MRN100234', patient_name: 'Jane Okafor',
    date_of_birth: '1968-04-11', sex: 'F',
    primary_diagnosis_code: 'C50.912', primary_diagnosis_desc: 'Malignant neoplasm of right female breast',
    diagnosis_date: '2026-06-02',
    reportability_score: 0.96, reportability_label: 'likely_reportable',
    classifier_rationale:
      'Core biopsy final diagnosis: invasive ductal carcinoma (8500/3), C50 site, behavior /3. Meets SEER reportability for a first invasive breast primary.',
    key_codes: ['C50.912', '8500/3'], flagged_at: '2026-06-03T14:12:00Z',
  },
  {
    case_id: 'C-0002', patient_mrn: 'MRN100517', patient_name: 'Maria Delgado',
    date_of_birth: '1959-11-23', sex: 'F',
    primary_diagnosis_code: 'C50.411', primary_diagnosis_desc: 'Malignant neoplasm of upper-outer quadrant of right female breast',
    diagnosis_date: '2026-05-28',
    reportability_score: 0.94, reportability_label: 'likely_reportable',
    classifier_rationale:
      'Lumpectomy synoptic: invasive ductal carcinoma, pT2 pN1a, ER+/PR+. Clear reportable invasive primary.',
    key_codes: ['C50.411', '8500/3', 'pT2'], flagged_at: '2026-05-29T09:41:00Z',
  },
  {
    case_id: 'C-0003', patient_mrn: 'MRN100844', patient_name: 'Aisha Rahman',
    date_of_birth: '1974-02-19', sex: 'F',
    primary_diagnosis_code: 'C50.212', primary_diagnosis_desc: 'Malignant neoplasm of upper-inner quadrant of right female breast',
    diagnosis_date: '2026-06-08',
    reportability_score: 0.89, reportability_label: 'likely_reportable',
    classifier_rationale:
      'Invasive lobular carcinoma (8520/3) on excision. Reportable; laterality confirmed right on gross.',
    key_codes: ['C50.212', '8520/3'], flagged_at: '2026-06-09T16:20:00Z',
  },
  {
    case_id: 'C-0004', patient_mrn: 'MRN101002', patient_name: 'Grace Kim',
    date_of_birth: '1982-07-30', sex: 'F',
    primary_diagnosis_code: 'D05.11', primary_diagnosis_desc: 'Intraductal carcinoma in situ of right breast',
    diagnosis_date: '2026-06-01',
    reportability_score: 0.83, reportability_label: 'likely_reportable',
    classifier_rationale:
      'DCIS (8500/2) on stereotactic biopsy. In-situ breast carcinoma is reportable; behavior /2.',
    key_codes: ['D05.11', '8500/2'], flagged_at: '2026-06-02T11:05:00Z',
  },
  {
    case_id: 'C-0005', patient_mrn: 'MRN101318', patient_name: 'Linda Powell',
    date_of_birth: '1951-09-05', sex: 'F',
    primary_diagnosis_code: 'C50.512', primary_diagnosis_desc: 'Malignant neoplasm of lower-outer quadrant of right female breast',
    diagnosis_date: '2026-05-19',
    reportability_score: 0.92, reportability_label: 'likely_reportable',
    classifier_rationale:
      'Mastectomy specimen with invasive mucinous carcinoma (8480/3). Reportable invasive primary.',
    key_codes: ['C50.512', '8480/3'], flagged_at: '2026-05-20T08:55:00Z',
  },
  {
    case_id: 'C-0006', patient_mrn: 'MRN101540', patient_name: 'Robert Ellison',
    date_of_birth: '1963-01-14', sex: 'M',
    primary_diagnosis_code: 'C50.929', primary_diagnosis_desc: 'Malignant neoplasm of unspecified site of left male breast',
    diagnosis_date: '2026-06-11',
    reportability_score: 0.86, reportability_label: 'likely_reportable',
    classifier_rationale:
      'Male breast, invasive ductal carcinoma (8500/3). Rare but reportable; site C50, behavior /3.',
    key_codes: ['C50.929', '8500/3'], flagged_at: '2026-06-12T13:30:00Z',
  },
  {
    case_id: 'C-0007', patient_mrn: 'MRN101733', patient_name: 'Sofia Marchetti',
    date_of_birth: '1979-06-22', sex: 'F',
    primary_diagnosis_code: 'C50.312', primary_diagnosis_desc: 'Malignant neoplasm of lower-inner quadrant of right female breast',
    diagnosis_date: '2026-06-15',
    reportability_score: 0.72, reportability_label: 'uncertain',
    classifier_rationale:
      'Imaging BI-RADS 5 with atypical core biopsy; final malignant diagnosis not clearly documented in available note. Needs registrar review.',
    key_codes: ['C50.312', 'BI-RADS 5'], flagged_at: '2026-06-16T10:02:00Z',
  },
  {
    case_id: 'C-0008', patient_mrn: 'MRN101911', patient_name: 'Deborah White',
    date_of_birth: '1946-12-02', sex: 'F',
    primary_diagnosis_code: 'C50.919', primary_diagnosis_desc: 'Malignant neoplasm of unspecified site of right female breast',
    diagnosis_date: '2026-04-27',
    reportability_score: 0.68, reportability_label: 'uncertain',
    classifier_rationale:
      'Path mentions "carcinoma" but specimen laterality and invasive-vs-in-situ behavior are ambiguous across notes.',
    key_codes: ['C50.919', '8010/3'], flagged_at: '2026-04-28T15:44:00Z',
  },
  {
    case_id: 'C-0009', patient_mrn: 'MRN102087', patient_name: 'Yolanda Brooks',
    date_of_birth: '1970-03-17', sex: 'F',
    primary_diagnosis_code: 'C50.812', primary_diagnosis_desc: 'Malignant neoplasm of overlapping sites of right female breast',
    diagnosis_date: '2026-05-30',
    reportability_score: 0.9, reportability_label: 'likely_reportable',
    classifier_rationale:
      'Multifocal invasive ductal carcinoma, overlapping quadrants. Reportable; treat as single primary.',
    key_codes: ['C50.812', '8500/3'], flagged_at: '2026-05-31T12:18:00Z',
  },
  {
    case_id: 'C-0010', patient_mrn: 'MRN102255', patient_name: 'Hannah Nguyen',
    date_of_birth: '1988-08-09', sex: 'F',
    primary_diagnosis_code: 'C50.112', primary_diagnosis_desc: 'Malignant neoplasm of central portion of right female breast',
    diagnosis_date: '2026-06-18',
    reportability_score: 0.61, reportability_label: 'uncertain',
    classifier_rationale:
      'Encapsulated papillary carcinoma; borderline behavior coding. Reportability depends on invasive component — registrar to verify.',
    key_codes: ['C50.112', '8503/2'], flagged_at: '2026-06-19T09:12:00Z',
  },
  {
    case_id: 'C-0011', patient_mrn: 'MRN102401', patient_name: 'Patricia Alvarez',
    date_of_birth: '1955-05-25', sex: 'F',
    primary_diagnosis_code: 'C50.422', primary_diagnosis_desc: 'Malignant neoplasm of upper-outer quadrant of left female breast',
    diagnosis_date: '2026-06-05',
    reportability_score: 0.88, reportability_label: 'likely_reportable',
    classifier_rationale:
      'Invasive ductal carcinoma, left breast, on excisional biopsy. Reportable invasive primary.',
    key_codes: ['C50.422', '8500/3'], flagged_at: '2026-06-06T17:33:00Z',
  },
  {
    case_id: 'C-0012', patient_mrn: 'MRN102588', patient_name: 'Michelle Carter',
    date_of_birth: '1991-10-12', sex: 'F',
    primary_diagnosis_code: 'N63.0', primary_diagnosis_desc: 'Unspecified lump in unspecified breast',
    diagnosis_date: '2026-06-20',
    reportability_score: 0.34, reportability_label: 'not_reportable',
    classifier_rationale:
      'Core biopsy: fibroadenoma, benign. No malignancy identified. Likely not reportable — confirm no malignant addendum.',
    key_codes: ['N63.0', '8010/0'], flagged_at: '2026-06-21T08:00:00Z',
  },
  {
    case_id: 'C-0013', patient_mrn: 'MRN102744', patient_name: 'Karen Foster',
    date_of_birth: '1960-02-28', sex: 'F',
    primary_diagnosis_code: 'C50.412', primary_diagnosis_desc: 'Malignant neoplasm of upper-outer quadrant of right female breast',
    diagnosis_date: '2026-06-14',
    reportability_score: 0.91, reportability_label: 'likely_reportable',
    classifier_rationale:
      'Invasive ductal carcinoma with associated DCIS. Reportable; code invasive component.',
    key_codes: ['C50.412', '8500/3'], flagged_at: '2026-06-15T14:47:00Z',
  },
  {
    case_id: 'C-0014', patient_mrn: 'MRN102910', patient_name: 'Emily Sanders',
    date_of_birth: '1984-11-03', sex: 'F',
    primary_diagnosis_code: 'R92.8', primary_diagnosis_desc: 'Other abnormal and inconclusive findings on diagnostic imaging of breast',
    diagnosis_date: '2026-06-22',
    reportability_score: 0.28, reportability_label: 'not_reportable',
    classifier_rationale:
      'Atypical ductal hyperplasia on biopsy; no carcinoma. Not reportable unless upgraded on excision.',
    key_codes: ['R92.8', 'ADH'], flagged_at: '2026-06-23T10:38:00Z',
  },
  {
    case_id: 'C-0015', patient_mrn: 'MRN103077', patient_name: 'Angela Thompson',
    date_of_birth: '1972-07-19', sex: 'F',
    primary_diagnosis_code: 'C50.522', primary_diagnosis_desc: 'Malignant neoplasm of lower-outer quadrant of left female breast',
    diagnosis_date: '2026-06-10',
    reportability_score: 0.79, reportability_label: 'uncertain',
    classifier_rationale:
      'Invasive carcinoma NOS on outside path; slides pending internal review. Reportable if confirmed — flag for registrar.',
    key_codes: ['C50.522', '8010/3'], flagged_at: '2026-06-11T11:26:00Z',
  },
];

/** Cases pre-seeded as in-progress drafts (already triaged reportable). */
export const PRESEEDED_DRAFT_IDS = ['C-0002', 'C-0005', 'C-0009'];
