/**
 * Hands the browser a file to save, made here: the text came through the API
 * with the person's token in a header, and the address the browser saves from
 * is a blob's — so no token ever stands in an address.
 */
export function saveFile(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
