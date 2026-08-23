import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from '@/api/client';
import type { QueueQuery, TriageBody } from '@/types/api';

export const qk = {
  me: ['me'] as const,
  queue: (q: QueueQuery) => ['queue', q] as const,
  drafts: ['drafts'] as const,
  case: (id: string) => ['case', id] as const,
};

export function useMe() {
  return useQuery({ queryKey: qk.me, queryFn: () => api.getMe(), staleTime: Infinity });
}

export function useQueue(query: QueueQuery) {
  return useQuery({
    queryKey: qk.queue(query),
    queryFn: () => api.getQueue(query),
    placeholderData: (prev) => prev, // keep previous page while filtering
  });
}

export function useDrafts() {
  return useQuery({ queryKey: qk.drafts, queryFn: () => api.getDrafts() });
}

export function useCase(caseId: string | undefined) {
  return useQuery({
    queryKey: qk.case(caseId ?? ''),
    queryFn: () => api.getCase(caseId!),
    enabled: !!caseId,
  });
}

export function useTriage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ caseId, body }: { caseId: string; body: TriageBody }) =>
      api.triage(caseId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['queue'] });
      qc.invalidateQueries({ queryKey: qk.drafts });
    },
  });
}

export function usePatchField(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, value }: { itemId: number; value: string | null }) =>
      api.patchField(caseId, itemId, value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.case(caseId) });
      qc.invalidateQueries({ queryKey: qk.drafts });
    },
  });
}

export function useFillUnknown(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ section }: { section: string | null }) =>
      api.fillUnknown(caseId, section),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.case(caseId) });
      qc.invalidateQueries({ queryKey: qk.drafts });
    },
  });
}

export function useFinish(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.finish(caseId),
    onSuccess: (result) => {
      if (result.finalized) {
        qc.invalidateQueries({ queryKey: ['queue'] });
        qc.invalidateQueries({ queryKey: qk.drafts });
        qc.removeQueries({ queryKey: qk.case(caseId) });
      } else {
        qc.invalidateQueries({ queryKey: qk.case(caseId) });
      }
    },
  });
}
