import { accounts } from "../globals";

// The user ID must match the bytes used when the passkey was created.
export async function signalPasskeyHandle(accountId: number) {
    const account = accounts.value?.find(({ id }) => id === accountId);
    if (!account || typeof PublicKeyCredential === "undefined") return;

    const credential = PublicKeyCredential as typeof PublicKeyCredential & {
        signalCurrentUserDetails?: (options: {
            rpId: string;
            userId: string;
            name: string;
            displayName: string;
        }) => Promise<void>;
    };
    if (!credential.signalCurrentUserDetails) return;

    await credential.signalCurrentUserDetails({
        rpId: window.location.hostname,
        userId: btoa(accountId.toString()).replace(/=+$/, ""),
        name: account.handle,
        displayName: account.handle,
    });
}
