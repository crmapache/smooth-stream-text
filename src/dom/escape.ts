/** Text as HTML, for the markup a host is first rendered with - on a server too. */
export const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
