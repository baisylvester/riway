export class IntegrationUnavailable extends Error {
  constructor(public readonly provider: string) {
    super(
      `${provider} is awaiting approved API documentation and credentials.`,
    );
  }
}
export interface PaymentAdapter {
  createSession(input: {
    orderId: string;
    amountMinor: number;
    currency: string;
    idempotencyKey: string;
  }): Promise<{ redirectUrl: string }>;
  verifyWebhook(
    rawBody: string,
    signature: string,
  ): Promise<{ eventId: string; orderId: string; status: string }>;
}
export interface MemberAdapter {
  validateSponsor(
    code: string,
  ): Promise<{ externalMemberId: string; active: boolean }>;
  submitOrder(input: {
    orderId: string;
    memberId: string;
    sponsorId: string;
    volume: string;
  }): Promise<{ reference: string }>;
}
export class DisabledPaymentAdapter implements PaymentAdapter {
  async createSession(): Promise<never> {
    throw new IntegrationUnavailable("Payment gateway");
  }
  async verifyWebhook(): Promise<never> {
    throw new IntegrationUnavailable("Payment gateway");
  }
}
export class DisabledMemberAdapter implements MemberAdapter {
  async validateSponsor(): Promise<never> {
    throw new IntegrationUnavailable("RIWAY member system");
  }
  async submitOrder(): Promise<never> {
    throw new IntegrationUnavailable("RIWAY compensation system");
  }
}
