export function logoutRequest() {
  return {
    subject: { kind: "logout" },
    createMatch: () => ({ kind: "logout" as const }),
  };
}
