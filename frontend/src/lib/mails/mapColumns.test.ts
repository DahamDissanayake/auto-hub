import { autoMapColumns } from './mapColumns'

describe('autoMapColumns', () => {
  it('maps exact canonical names', () => {
    const m = autoMapColumns(['firstName', 'lastName', 'email', 'company'])
    expect(m.firstName).toBe('firstName')
    expect(m.lastName).toBe('lastName')
    expect(m.email).toBe('email')
    expect(m.company).toBe('company')
  })

  it('maps common variants case-insensitively', () => {
    const m = autoMapColumns(['First Name', 'Last Name', 'Email Address', 'Company Name'])
    expect(m['First Name']).toBe('firstName')
    expect(m['Last Name']).toBe('lastName')
    expect(m['Email Address']).toBe('email')
    expect(m['Company Name']).toBe('company')
  })

  it('maps short variants', () => {
    const m = autoMapColumns(['first', 'last', 'mail', 'org'])
    expect(m.first).toBe('firstName')
    expect(m.last).toBe('lastName')
    expect(m.mail).toBe('email')
    expect(m.org).toBe('company')
  })

  it('marks unknown columns as ignore', () => {
    const m = autoMapColumns(['LinkedIn URL', 'Phone Number'])
    expect(m['LinkedIn URL']).toBe('ignore')
    expect(m['Phone Number']).toBe('ignore')
  })
})
