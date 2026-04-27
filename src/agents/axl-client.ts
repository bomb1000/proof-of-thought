export interface AXLNodeConfig {
  host: string;
  port: number;
}

export interface AXLTopology {
  ourPublicKey: string;
  peers: { publicKey: string; address: string }[];
}

export interface AXLMessage {
  from: string;
  data: string;
}

export class AXLClient {
  private baseUrl: string;

  constructor(config: AXLNodeConfig) {
    this.baseUrl = `${config.host}:${config.port}`;
  }

  async send(destinationPeerId: string, message: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/send`, {
      method: "POST",
      headers: {
        "X-Destination-Peer-Id": destinationPeerId,
        "Content-Type": "application/json",
      },
      body: message,
    });

    if (!response.ok) {
      throw new Error(`AXL send failed (HTTP ${response.status})`);
    }
  }

  async recv(): Promise<AXLMessage[]> {
    const response = await fetch(`${this.baseUrl}/recv`);

    if (!response.ok) {
      throw new Error(`AXL recv failed (HTTP ${response.status})`);
    }

    const body = await response.text();
    if (!body || body.trim() === "") return [];

    try {
      const parsed = JSON.parse(body);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [{ from: "unknown", data: body }];
    }
  }

  async topology(): Promise<AXLTopology> {
    const response = await fetch(`${this.baseUrl}/topology`);

    if (!response.ok) {
      throw new Error(`AXL topology failed (HTTP ${response.status})`);
    }

    const data = await response.json();
    return {
      ourPublicKey: data.our_public_key ?? data.ourPublicKey ?? "",
      peers: (data.peers ?? []).map((p: any) => ({
        publicKey: p.public_key ?? p.publicKey ?? "",
        address: p.address ?? "",
      })),
    };
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.topology();
      return true;
    } catch {
      return false;
    }
  }
}
