export type LeadSource = "web" | "youtube" | "manual";
export type LeadStatus = "new" | "qualified" | "contacted" | "replied" | "archived";

export type Lead = {
  id: string;
  businessName: string;
  website?: string;
  email?: string;
  phone?: string;
  location?: string;
  description?: string;
  source: LeadSource;
  sourceUrl?: string;
  score: number;
  status: LeadStatus;
  scoreReasons: string[];
  createdAt: string;
  updatedAt: string;
};
