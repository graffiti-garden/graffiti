export interface Service {
  type: "bucket" | "inbox";
  serviceId: string;
  name: string;
  createdAt: number;
}
