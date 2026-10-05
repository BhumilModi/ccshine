import { expect, test } from 'claude-code/testing'

import type { Job } from '../types'
import { addJob, endJob, parseNotifications } from '../hooks/jobs'

test('parseNotifications reads each task id and status', async () => {
  expect(parseNotifications('<task-id>a</task-id><status>completed</status>')).toEqual([{ id: 'a', status: 'done' }])
  expect(parseNotifications('<task-id>a</task-id><status>failed</status> <task-id>b</task-id><status>killed</status>')).toEqual([
    { id: 'a', status: 'error' },
    { id: 'b', status: 'killed' },
  ])
  expect(parseNotifications('no tasks here')).toEqual([])
})

const job = (id: string, status: Job['status'] = 'running'): Job => ({ id, callId: `c-${id}`, startedAt: 0, status })

test('endJob ends a running job once', async () => {
  const list = endJob([job('a'), job('b')], 'a', 'done', 9)
  expect(list[0]).toEqual({ ...job('a'), status: 'done', endedAt: 9 })
  expect(list[1]).toEqual(job('b'))
  expect(endJob(list, 'a', 'killed', 12)[0]?.status).toBe('done')
})

test('endJob ignores an unknown id', async () => {
  const list = [job('a')]
  expect(endJob(list, 'gone', 'done', 5)).toEqual(list)
})

test('addJob replaces a job with the same id and keeps the newest 50', async () => {
  let list: Job[] = []
  for (let i = 0; i < 60; i++) list = addJob(list, job(String(i)))
  expect(list.length).toBe(50)
  expect(list[0]?.id).toBe('10')
  expect(addJob([job('a')], { ...job('a'), startedAt: 7 })).toEqual([{ ...job('a'), startedAt: 7 }])
})
