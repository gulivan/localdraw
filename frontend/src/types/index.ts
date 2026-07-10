export interface DrawingSummary {
  id: string;
  name: string;
  collectionId: string | null;
  updatedAt: number;
  createdAt: number;
  version: number;
  preview?: string | null;
  accessLevel?: "none" | "view" | "edit" | "owner";
  creatorName?: string | null;
  // Privacy/Encryption fields (private vault)
  isPrivate?: boolean;
  encryptedData?: string | null;
  iv?: string | null;
}
export interface Drawing extends DrawingSummary {
  elements: any[];
  appState: any;
  files: Record<string, any> | null;
}
export interface Collection {
  id: string;
  name: string;
  createdAt: number;
  sharedRole?: "view" | "edit" | null;
  isOwner?: boolean;
  isShared?: boolean;
}

// Vault types (private vault)
export interface VaultStatus {
  isSetup: boolean;
  salt?: string;
  hint?: string | null;
  privateDrawingsCount?: number;
}

export interface VaultVerifyResult {
  success: boolean;
  salt: string;
}

export type CollectionShareRole = "view" | "edit";

export interface CollectionShareUser {
  id: string;
  name: string;
  email: string;
}

export interface CollectionShareRow {
  id: string;
  collectionId: string;
  granteeUserId: string;
  granteeUser: CollectionShareUser;
  role: CollectionShareRole;
  createdAt: string;
  updatedAt: string;
}
