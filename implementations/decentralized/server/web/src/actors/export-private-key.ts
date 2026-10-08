import { fetchFromSelf } from "../globals";

export async function exportPrivateKey(did: string) {
    if (!confirm(
        "Anyone with this private key can take control of the actor. Keep the export file safe.",
    )) return false;

    const result = await fetchFromSelf(`/app/actors/actor/${did}`);
    const blob = new Blob([JSON.stringify(result)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${did}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return true;
}
