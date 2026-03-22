import { randomBytes } from "crypto";

export const defaultPassword = "Str0ngPassA1";
export const defaultAdminPassword = "Adm1nStrongPassA1";

const uniqueSuffix = () => `${Date.now()}-${randomBytes(3).toString("hex")}`;

export const buildUserPayload = (prefix = "user") => {
  const suffix = uniqueSuffix();

  return {
    fullName: `${prefix} ${suffix}`,
    email: `${prefix}.${suffix}@example.com`,
    password: defaultPassword
  };
};

export const buildAdminPayload = () => {
  const suffix = uniqueSuffix();

  return {
    fullName: `admin ${suffix}`,
    email: `admin.${suffix}@example.com`,
    password: defaultAdminPassword
  };
};

export const buildElectionPayload = ({
  title = "Student Council Election",
  type = "election",
  startsAt = new Date(Date.now() - 60_000).toISOString(),
  endsAt = new Date(Date.now() + 3_600_000).toISOString()
} = {}) => ({
  title,
  description: "Election created from integration tests",
  type,
  startsAt,
  endsAt,
  maxSelections: 1,
  resultsVisibility: "after_close",
  options: [
    { label: "Option A", description: "Candidate A" },
    { label: "Option B", description: "Candidate B" }
  ]
});

