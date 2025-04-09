export function parseCookie(cookieValue: string, cookieName: string): string | null {
  const cookieStr = " " + cookieValue
  let startIndex = cookieStr.indexOf(" " + cookieName + "=")
  if (startIndex === -1) {
    return null
  }
  startIndex = cookieStr.indexOf("=", startIndex) + 1;
  let endIndex = cookieStr.indexOf(";", startIndex);
  if (endIndex === -1) {
    endIndex = cookieStr.length
  }
  return decodeURIComponent(cookieStr.substring(startIndex, endIndex));
}
