import { ref } from "vue";

export const isLoggedIn = ref<boolean | undefined>(undefined);

export async function fetchFromSelf(
  path: string,
  options?: RequestInit | undefined,
) {
  const response = await fetch(path, options);
  if (!response.ok) {
    // If we hit an unauthorized error,
    // we must have been logged out
    if (response.status === 401) {
      isLoggedIn.value = false;
    }
    const message = await response.text();
    throw new Error(message);
  } else {
    return await response.json();
  }
}
