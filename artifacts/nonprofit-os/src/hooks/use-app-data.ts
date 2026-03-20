import { useQueryClient } from "@tanstack/react-query";
import { 
  useListProcesses, 
  useUpdateProcess,
  useDeleteProcess,
  useListCategories,
  getListProcessesQueryKey
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

export function useProcessesData() {
  return useListProcesses();
}

export function useCategoriesData() {
  return useListCategories();
}

export function useOptimisticUpdateProcess() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useUpdateProcess({
    mutation: {
      onMutate: async ({ id, data }) => {
        await queryClient.cancelQueries({ queryKey: getListProcessesQueryKey() });
        const previousProcesses = queryClient.getQueryData<any[]>(getListProcessesQueryKey());
        if (previousProcesses) {
          queryClient.setQueryData(getListProcessesQueryKey(), (old: any[]) => {
            return old?.map(process => 
              process.id === id ? { ...process, ...data } : process
            );
          });
        }
        return { previousProcesses };
      },
      onError: (err, _newProcess, context) => {
        if (context?.previousProcesses) {
          queryClient.setQueryData(getListProcessesQueryKey(), context.previousProcesses);
        }
        toast({
          title: "Failed to save changes",
          description: err.message || "An unexpected error occurred",
          variant: "destructive",
        });
      },
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey: getListProcessesQueryKey() });
      },
    }
  });
}

export function useDeleteProcessRow() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useDeleteProcess({
    mutation: {
      onMutate: async ({ id }) => {
        await queryClient.cancelQueries({ queryKey: getListProcessesQueryKey() });
        const previousProcesses = queryClient.getQueryData<any[]>(getListProcessesQueryKey());
        if (previousProcesses) {
          queryClient.setQueryData(getListProcessesQueryKey(), (old: any[]) =>
            old?.filter(p => p.id !== id)
          );
        }
        return { previousProcesses };
      },
      onError: (err, _vars, context) => {
        if (context?.previousProcesses) {
          queryClient.setQueryData(getListProcessesQueryKey(), context.previousProcesses);
        }
        toast({
          title: "Failed to delete process",
          description: err.message || "An unexpected error occurred",
          variant: "destructive",
        });
      },
      onSuccess: () => {
        toast({ title: "Process deleted" });
      },
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey: getListProcessesQueryKey() });
      },
    }
  });
}
