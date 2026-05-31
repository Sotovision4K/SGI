export interface Process {
  id: string;
  companyId: string;
  companyName: string;
  isoStandard: string;
  status: 'draft' | 'in_progress' | 'completed';
  createdAt: string;
  updatedAt: string;
}

export interface CreateProcessInput {
  companyId: string;
  companyName: string;
  isoStandard: string;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const mockProcesses: Process[] = [
  {
    id: 'proc-001',
    companyId: 'comp-001',
    companyName: 'TechCorp S.A.',
    isoStandard: 'ISO 9001:2015',
    status: 'in_progress',
    createdAt: '2024-01-15T10:30:00Z',
    updatedAt: '2024-03-20T14:22:00Z',
  },
  {
    id: 'proc-002',
    companyId: 'comp-001',
    companyName: 'TechCorp S.A.',
    isoStandard: 'ISO 14001:2015',
    status: 'draft',
    createdAt: '2024-03-01T09:00:00Z',
    updatedAt: '2024-03-01T09:00:00Z',
  },
  {
    id: 'proc-003',
    companyId: 'comp-002',
    companyName: 'Manufactura ABC',
    isoStandard: 'ISO 45001:2018',
    status: 'completed',
    createdAt: '2023-11-10T11:15:00Z',
    updatedAt: '2024-02-28T16:45:00Z',
  },
];

export async function getProcesses(): Promise<Process[]> {
  await delay(500);
  console.log('[API] getProcesses called');
  return [...mockProcesses];
}

export async function getProcess(processId: string): Promise<Process | null> {
  await delay(300);
  console.log('[API] getProcess called with id:', processId);
  return mockProcesses.find(p => p.id === processId) || null;
}

export async function createProcess(input: CreateProcessInput): Promise<Process> {
  await delay(800);
  console.log('[API] createProcess called with:', input);
  const newProcess: Process = {
    id: `proc-${Date.now()}`,
    companyId: input.companyId,
    companyName: input.companyName,
    isoStandard: input.isoStandard,
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  mockProcesses.push(newProcess);
  return newProcess;
}

export async function deleteProcess(processId: string): Promise<void> {
  await delay(500);
  console.log('[API] deleteProcess called with id:', processId);
  const index = mockProcesses.findIndex(p => p.id === processId);
  if (index !== -1) {
    mockProcesses.splice(index, 1);
  }
}