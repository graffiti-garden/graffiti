import { computed, ref } from "vue";

export type Account = { id: number; handle: string };

export function accountHandle(account: Account | undefined) {
  return account?.handle ?? "";
}

// accounts = undefined -> loading
// accounts = [] -> loaded but no logged in accounts
export const accounts = ref<Account[] | undefined>();
export const selectedAccount = ref<number | undefined>(
  Number(sessionStorage.getItem("graffiti-account")) || undefined,
);
export const currentAccount = computed(() =>
  accounts.value?.find((account) => account.id === selectedAccount.value),
);
export const isLoggedIn = computed(() =>
  accounts.value === undefined ? undefined : !!currentAccount.value,
);

export function selectAccount(accountId: number) {
  selectedAccount.value = accountId;
  sessionStorage.setItem("graffiti-account", String(accountId));
}

export async function refreshAccounts(accountId?: number) {
  const response = await fetch("/app/webauthn/accounts");
  if (!response.ok) throw new Error(await response.text());
  accounts.value = (await response.json()).accounts;
  if (accountId && accounts.value?.some((account) => account.id === accountId)) {
    selectAccount(accountId);
  } else if (
    !accounts.value?.some((account) => account.id === selectedAccount.value)
  ) {
    if (accounts.value?.length) {
      selectAccount(accounts.value[0].id);
    } else {
      selectedAccount.value = undefined;
      sessionStorage.removeItem("graffiti-account");
    }
  }
}

export async function fetchFromSelf(
  path: string,
  options?: RequestInit | undefined,
  withSelectedAccount = true,
) {
  const headers = new Headers(options?.headers);
  if (
    withSelectedAccount &&
    selectedAccount.value &&
    !headers.has("X-Graffiti-Account")
  ) {
    headers.set("X-Graffiti-Account", String(selectedAccount.value));
  }
  const response = await fetch(path, { ...options, headers });
  if (!response.ok) {
    // If we hit an unauthorized error,
    // check to see what the account status is
    if (response.status === 401) {
      void refreshAccounts().catch(console.error);
    }
    const message = await response.text();
    throw new Error(message);
  } else {
    return await response.json();
  }
}
