import { ref } from "vue";

export const isLoggedIn = ref<boolean | undefined>(undefined);

export async function fetchFromAPI(
  path: string,
  options?: RequestInit | undefined,
) {
  let url = path.startsWith("/") ? path : `/${path}`;
  url = url.startsWith("/api") ? url : `/api${url}`;

  const response = await fetch(url, options);
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
