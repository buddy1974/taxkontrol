'use client'

import { useEffect, useState } from 'react'

type Payment = { id: string; amount: number; period: string; isPaid: boolean; paidAt: string | null }
type Employee = { id: string; name: string; role: string | null; salaryType: string; salaryAmount: number; isActive: boolean; payments: Payment[] }

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', role: '', salaryType: 'MONTHLY', salaryAmount: '' })

  useEffect(() => {
    fetch('/api/v1/employees').then(r => r.json()).then(data => { setEmployees(data); setLoading(false) })
  }, [])

  const activeEmployees = employees.filter(e => e.isActive)
  const totalMonthlySalary = activeEmployees.reduce((sum, e) => sum + e.salaryAmount, 0)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const res = await fetch('/api/v1/employees', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    const newEmp = await res.json()
    setEmployees(prev => [...prev, newEmp])
    setShowForm(false)
    setSaving(false)
    setForm({ name: '', role: '', salaryType: 'MONTHLY', salaryAmount: '' })
  }

  async function handlePay(id: string) {
    const res = await fetch('/api/v1/employees', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action: 'pay', period: new Date().toISOString() }) })
    const payment = await res.json()
    setEmployees(prev => prev.map(e => e.id === id ? { ...e, payments: [payment, ...e.payments] } : e))
  }

  if (loading) return <div className="text-gray-500 text-sm">Loading...</div>

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Employees</h1>
          <p className="text-gray-500 text-sm mt-1">Track salaries and payments (Mitarbeiter)</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg">+ Add employee</button>
      </div>

      <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
        <p className="text-sm text-gray-400">Total monthly salary cost</p>
        <p className="text-3xl font-bold text-white mt-1">€{totalMonthlySalary.toFixed(2)}<span className="text-base font-normal text-gray-500 ml-2">/ month</span></p>
        <p className="text-xs text-gray-500 mt-1">{activeEmployees.length} active employee(s)</p>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="rounded-xl bg-gray-900 border border-blue-800 p-5 space-y-4">
          <p className="text-sm font-medium text-white">New employee</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Name</label>
              <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required placeholder="John Doe" className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Role</label>
              <input type="text" value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} placeholder="Designer" className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Salary type</label>
              <select value={form.salaryType} onChange={e => setForm(p => ({ ...p, salaryType: e.target.value }))} className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none">
                <option value="MONTHLY">Monthly</option>
                <option value="HOURLY">Hourly</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Amount (€)</label>
              <input type="number" step="0.01" value={form.salaryAmount} onChange={e => setForm(p => ({ ...p, salaryAmount: e.target.value }))} required placeholder="2000.00" className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 bg-gray-800 text-gray-400 text-sm rounded-lg hover:text-white">Cancel</button>
          </div>
        </form>
      )}

      <div className="rounded-xl bg-gray-900 border border-gray-800 divide-y divide-gray-800">
        {employees.length === 0 ? (
          <div className="p-8 text-center"><p className="text-gray-400">No employees yet.</p></div>
        ) : (
          employees.map(emp => (
            <div key={emp.id} className={`px-5 py-4 ${!emp.isActive ? 'opacity-40' : ''}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">{emp.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{emp.role ?? 'No role'} · {emp.salaryType === 'MONTHLY' ? 'Monthly' : 'Hourly'}</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-sm font-semibold text-white">€{emp.salaryAmount.toFixed(2)}</p>
                  {emp.isActive && (
                    <button onClick={() => handlePay(emp.id)} className="px-3 py-1.5 bg-emerald-900 hover:bg-emerald-800 text-emerald-400 text-xs rounded-lg">Mark paid</button>
                  )}
                </div>
              </div>
              {emp.payments.length > 0 && (
                <div className="mt-2 space-y-1">
                  {emp.payments.slice(0, 2).map(p => (
                    <p key={p.id} className="text-xs text-gray-500">Paid €{p.amount.toFixed(2)} on {new Date(p.paidAt ?? p.period).toLocaleDateString('en-DE')}</p>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
