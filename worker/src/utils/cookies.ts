// export function getCookie(cookieHeader: string | null, name: string): string | null {
//   if (!cookieHeader) return null

//   // Split the header string into individual cookie parts
//   const parts = cookieHeader.split(";")

//   for (const part of parts) {
//     const trimmedPart = part.trim()
//     // Use startsWith to check for the cookie name followed by '='
//     if (trimmedPart.startsWith(`${name}=`)) {
//       // Return the value part (everything after 'name=')
//       return trimmedPart.substring(name.length + 1)
//     }
//   }
//   return null
// }
