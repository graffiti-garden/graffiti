export interface Service {
  type: "bucket" | "inbox";
  serviceId: string;
  createdAt: number;
}
