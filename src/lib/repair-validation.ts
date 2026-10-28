export type RepairMapping = {
  sourceField: string;
  targetField: string;
  rationale: string;
};

export type RepairProposal = {
  diagnosis: string;
  rootCause: string;
  confidence: number;
  mappings: RepairMapping[];
};

export type TargetColumn = {
  columnName: string;
  dataType: string;
  nullable: boolean;
  hasDefault: boolean;
};

export type ValidationCheck = {
  key: string;
  passed: boolean;
  detail: string;
};

export type RepairValidation = {
  passed: boolean;
  checks: ValidationCheck[];
};

const allowedMappings = new Map([
  ["issue_title->title", { sourceType: "text", targetTypes: new Set(["text", "character varying", "character"]) }],
]);

const safeIdentifier = /^[a-z_][a-z0-9_]*$/;
const fieldsWrittenByCurrentSync = new Set([
  "source",
  "repository",
  "external_id",
  "issue_number",
  "body",
  "state",
  "html_url",
  "source_updated_at",
  "synced_at",
]);

export function validateRepairProposal(proposal: RepairProposal, columns: TargetColumn[]): RepairValidation {
  const checks: ValidationCheck[] = [];
  const add = (key: string, passed: boolean, detail: string) => checks.push({ key, passed, detail });

  add("proposal_shape", proposal.mappings.length > 0 && proposal.mappings.length <= 4, "Proposal contains between one and four candidate mappings.");
  const seenSources = new Set<string>();
  const seenTargets = new Set<string>();
  let allowlistPass = true;
  let identifierPass = true;
  let typePass = true;

  for (const mapping of proposal.mappings) {
    if (!safeIdentifier.test(mapping.sourceField) || !safeIdentifier.test(mapping.targetField)) {
      identifierPass = false;
      continue;
    }

    const key = `${mapping.sourceField}->${mapping.targetField}`;
    const policy = allowedMappings.get(key);
    if (!policy) allowlistPass = false;

    const target = columns.find((column) => column.columnName === mapping.targetField);
    if (!target) {
      typePass = false;
    } else if (policy && !policy.targetTypes.has(target.dataType)) {
      typePass = false;
    }

    if (seenSources.has(mapping.sourceField) || seenTargets.has(mapping.targetField)) {
      allowlistPass = false;
    }
    seenSources.add(mapping.sourceField);
    seenTargets.add(mapping.targetField);
  }

  add("safe_identifiers", identifierPass, "Candidate field names use plain lowercase SQL identifiers; expressions and SQL fragments are not accepted.");
  add("mapping_allowlist", allowlistPass, "Every source-to-target pair is explicitly allowed and has no duplicate source or destination.");
  add("target_types", typePass, "Each allowed target exists in the inspected table and has a compatible type.");

  const mappedTargets = new Set(proposal.mappings.map((mapping) => mapping.targetField));
  const uncoveredRequired = columns.filter(
    (column) => !column.nullable && !column.hasDefault &&
      !fieldsWrittenByCurrentSync.has(column.columnName) && !mappedTargets.has(column.columnName),
  );
  add(
    "required_columns",
    uncoveredRequired.length === 0,
    uncoveredRequired.length === 0
      ? "Every required destination column is populated by the current sync or the allowed mapping."
      : `Required destination columns are not covered: ${uncoveredRequired.map((column) => column.columnName).join(", ")}.`,
  );

  return { passed: checks.every((check) => check.passed), checks };
}

export function parseRepairProposal(value: unknown): RepairProposal {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Proposal is not an object.");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !["diagnosis", "rootCause", "confidence", "mappings"].includes(key))) {
    throw new Error("Proposal contains unsupported properties.");
  }
  if (
    typeof record.diagnosis !== "string" || record.diagnosis.length === 0 || record.diagnosis.length > 500 ||
    typeof record.rootCause !== "string" || record.rootCause.length === 0 || record.rootCause.length > 500 ||
    typeof record.confidence !== "number" || !Number.isFinite(record.confidence) || record.confidence < 0 || record.confidence > 1 ||
    !Array.isArray(record.mappings) || record.mappings.length === 0 || record.mappings.length > 4
  ) {
    throw new Error("Proposal fields are missing or outside their bounds.");
  }

  const mappings = record.mappings.map((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("Mapping is not an object.");
    const mapping = candidate as Record<string, unknown>;
    if (
      Object.keys(mapping).some((key) => !["sourceField", "targetField", "rationale"].includes(key)) ||
      typeof mapping.sourceField !== "string" || mapping.sourceField.length > 80 ||
      typeof mapping.targetField !== "string" || mapping.targetField.length > 80 ||
      typeof mapping.rationale !== "string" || mapping.rationale.length > 500
    ) {
      throw new Error("Mapping fields are missing or outside their bounds.");
    }
    return { sourceField: mapping.sourceField, targetField: mapping.targetField, rationale: mapping.rationale };
  });

  return {
    diagnosis: record.diagnosis,
    rootCause: record.rootCause,
    confidence: record.confidence,
    mappings,
  };
}
