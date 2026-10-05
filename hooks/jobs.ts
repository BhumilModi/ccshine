import type { Job } from '../types'

const MAX_JOBS = 50

// `<task-notification>` bodies name each finished task's id and status.
export function parseNotifications(text: string): { id: string; status: Job['status'] }[] {
  return [...text.matchAll(/<task-id>([^<]+)<\/task-id>[\s\S]*?<status>([^<]+)<\/status>/g)].map(m => {
    const word = (m[2] ?? '').trim()
    return { id: (m[1] ?? '').trim(), status: word === 'completed' ? 'done' : word === 'failed' ? 'error' : 'killed' }
  })
}

export function addJob(list: Job[], job: Job): Job[] {
  return [...list.filter(one => one.id !== job.id), job].slice(-MAX_JOBS)
}

// Only a running job ends; an id from before /clear or a reload finds nothing and changes nothing.
export function endJob(list: Job[], id: string, status: Job['status'], at: number): Job[] {
  return list.map(job => (job.id === id && job.status === 'running' ? { ...job, status, endedAt: at } : job))
}
