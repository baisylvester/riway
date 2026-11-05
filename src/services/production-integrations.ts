import "server-only";

/**
 * Server-only contracts for the next RIWAY integration phase.
 * Implementations must remain disabled until the provider contract, sandbox,
 * credentials, retry policy, and reconciliation process are approved.
 */
export class ProviderNotConfigured extends Error {
  constructor(provider: string) {
    super(`${provider} is not configured; the operation is fail-closed.`);
    this.name = "ProviderNotConfigured";
  }
}

export type InventoryLine = {
  sku: string;
  market: string;
  location?: string;
  quantity: number;
};

export type InventorySnapshot = Omit<InventoryLine, "quantity"> & {
  onHand: number;
  reserved: number;
  available: number;
  externalUpdatedAt?: string;
  externalReference?: string;
};

export interface StoreOwnerInventoryAdapter {
  getInventory(input: {
    sku: string;
    market: string;
    location?: string;
  }): Promise<InventorySnapshot>;
  reserveInventory(input: {
    idempotencyKey: string;
    orderReference: string;
    lines: InventoryLine[];
  }): Promise<{ reference: string }>;
  releaseReservation(input: {
    idempotencyKey: string;
    reservationReference: string;
  }): Promise<void>;
  commitAllocation(input: {
    idempotencyKey: string;
    reservationReference: string;
  }): Promise<void>;
  adjustInventory(input: {
    idempotencyKey: string;
    line: InventoryLine;
    reason: string;
  }): Promise<{ reference: string }>;
  reconcileInventory(input: {
    market: string;
    cursor?: string;
  }): Promise<{ items: InventorySnapshot[]; nextCursor?: string }>;
  verifyWebhook(input: {
    rawBody: string;
    signature: string;
  }): Promise<{ eventId: string; type: string }>;
}

export interface TransactionalEmailProvider {
  send(input: {
    idempotencyKey: string;
    to: string[];
    subject: string;
    html: string;
    text: string;
    replyTo?: string;
  }): Promise<{ providerMessageId: string }>;
}

export interface ObjectStorageProvider {
  createUpload(input: {
    key: string;
    contentType: string;
    contentLength: number;
  }): Promise<{ uploadUrl: string; expiresAt: string }>;
  createDownload(input: {
    key: string;
    expiresInSeconds: number;
  }): Promise<{ downloadUrl: string; expiresAt: string }>;
  deleteObject(input: { key: string }): Promise<void>;
}

export class DisabledStoreOwnerInventoryAdapter implements StoreOwnerInventoryAdapter {
  private unavailable(): never {
    throw new ProviderNotConfigured("Store-owner inventory provider");
  }
  getInventory(): Promise<InventorySnapshot> {
    return this.unavailable();
  }
  reserveInventory(): Promise<{ reference: string }> {
    return this.unavailable();
  }
  releaseReservation(): Promise<void> {
    return this.unavailable();
  }
  commitAllocation(): Promise<void> {
    return this.unavailable();
  }
  adjustInventory(): Promise<{ reference: string }> {
    return this.unavailable();
  }
  reconcileInventory(): Promise<{
    items: InventorySnapshot[];
    nextCursor?: string;
  }> {
    return this.unavailable();
  }
  verifyWebhook(): Promise<{ eventId: string; type: string }> {
    return this.unavailable();
  }
}

export class DisabledTransactionalEmailProvider implements TransactionalEmailProvider {
  async send(): Promise<never> {
    throw new ProviderNotConfigured("Resend");
  }
}

export class DisabledObjectStorageProvider implements ObjectStorageProvider {
  async createUpload(): Promise<never> {
    throw new ProviderNotConfigured("Cloudflare R2");
  }
  async createDownload(): Promise<never> {
    throw new ProviderNotConfigured("Cloudflare R2");
  }
  async deleteObject(): Promise<never> {
    throw new ProviderNotConfigured("Cloudflare R2");
  }
}

export function integrationFlags() {
  return {
    clerk: process.env.AUTH_PROVIDER === "clerk",
    resend: process.env.EMAIL_PROVIDER === "resend",
    r2: process.env.STORAGE_PROVIDER === "r2",
    storeOwnerInventory: process.env.INVENTORY_PROVIDER === "store-owner",
  };
}
