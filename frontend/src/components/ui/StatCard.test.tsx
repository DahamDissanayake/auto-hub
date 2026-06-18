import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatCard from './StatCard'
import { AlertCircle } from 'lucide-react'

describe('StatCard', () => {
  it('renders label and value', () => {
    render(<StatCard label="Total Plugins" value={5} icon={AlertCircle} />)
    expect(screen.getByText('Total Plugins')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('renders with red accent class when accent="red"', () => {
    const { getByTestId } = render(
      <StatCard label="Failures" value={3} icon={AlertCircle} accent="red" />,
    )
    expect(getByTestId('stat-card')).toHaveClass('border-[#ef4444]/40')
  })

  it('renders without accent class when no accent prop', () => {
    const { getByTestId } = render(
      <StatCard label="Plugins" value={0} icon={AlertCircle} />,
    )
    expect(getByTestId('stat-card')).toHaveClass('border-[#2a2a2a]')
  })
})
