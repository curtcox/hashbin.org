/**
 * Stand-ins for the Expo modules used by examples/textpad-expo, so its
 * HashBin client can run under Node. vitest.config.js points the module
 * names here.
 */

// expo-secure-store, backed by a Map that tests can inspect.
export const secureStore = new Map();

export async function getItemAsync(key) {
  return secureStore.get(key) ?? null;
}

export async function setItemAsync(key, value) {
  secureStore.set(key, value);
}

export async function deleteItemAsync(key) {
  secureStore.delete(key);
}
