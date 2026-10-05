import { expect, test } from 'claude-code/testing'

import type { PlanTask } from '../types'
import type { PlanData } from '../hooks/planview'
import { planWanted } from '../hooks/planview'

const task = (id: string, status: PlanTask['status'], parent?: string): PlanTask => ({ id, subject: id, status, createdAt: 0, ...(parent ? { parent } : {}) })
const data = (over: Partial<PlanData>): PlanData => ({ tasks: [], agents: [], shells: [], tails: {}, shellHistory: {}, planHistory: [], now: 0, all: false, ...over })

test('planWanted counts the running task\'s sub-items and caps the rest at eight', async () => {
  const tasks = [task('a', 'completed'), task('b', 'in_progress'), task('b1', 'pending', 'b'), task('c', 'pending')]
  expect(planWanted(data({ tasks }))).toEqual({ plan: 3, shell: 0, tails: 0, focus: true })
  const many = Array.from({ length: 20 }, (_, i) => task(`t${i}`, i === 0 ? 'in_progress' : 'pending'))
  expect(planWanted(data({ tasks: many })).plan).toBe(8)
  expect(planWanted(data({ tasks: many, all: true })).plan).toBe(19)
})

test('planWanted asks for a shell label, its rows and a running job\'s output line', async () => {
  const shells = [{ id: 'j1', label: 'Dev server', startedAt: 0, status: 'running' as const, background: true, outputFile: '/t/j1.output' }]
  expect(planWanted(data({ shells, tails: { '/t/j1.output': 'ready' } }))).toEqual({ plan: 0, shell: 2, tails: 1, focus: false })
})
