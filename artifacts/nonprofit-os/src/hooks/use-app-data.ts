import { useQueryClient } from "@tanstack/react-query";
import { 
  useListProcesses, 
  useUpdateProcess,
  useListCategories,
  getListProcessesQueryKey
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

// We create wrapper hooks to handle optimistic updates for the spreadsheet feel
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
        // Cancel any outgoing refetches
        await queryClient.cancelQueries({ queryKey: getListProcessesQueryKey() });

        // Snapshot the previous value
        const previousProcesses = queryClient.getQueryData<any[]>(getListProcessesQueryKey());

        // Optimistically update to the new value
        if (previousProcesses) {
          queryClient.setQueryData(getListProcessesQueryKey(), (old: any[]) => {
            return old?.map(process => 
              process.id === id ? { ...process, ...data } : process
            );
          });
        }

        return { previousProcesses };
      },
      onError: (err, newProcess, context) => {
        // If the mutation fails, use the context returned from onMutate to roll back
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
        // Always refetch after error or success to ensure sync
        queryClient.invalidateQueries({ queryKey: getListProcessesQueryKey() });
      },
    }
  });
}
