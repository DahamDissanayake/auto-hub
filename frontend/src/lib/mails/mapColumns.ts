type FieldName = 'firstName' | 'lastName' | 'email' | 'company' | 'ignore'

const MATCHERS: Array<[FieldName, RegExp]> = [
  ['firstName', /^(first\s?name?|firstname|fname|first)$/i],
  ['lastName',  /^(last\s?name?|lastname|lname|last|surname)$/i],
  ['email',     /^(email(\s?address)?|e-?mail|mail)$/i],
  ['company',   /^(company(\s?name)?|organization|organisation|org|employer|business)$/i],
]

export function autoMapColumns(headers: string[]): Record<string, FieldName> {
  return Object.fromEntries(
    headers.map(h => {
      const match = MATCHERS.find(([, re]) => re.test(h.trim()))
      return [h, match ? match[0] : 'ignore']
    })
  )
}
