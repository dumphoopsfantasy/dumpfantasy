import { usePersistedState } from "./usePersistedState";

export const useDraftVisibility = () => {
  const [showDraftTab, setShowDraftTab] = usePersistedState<boolean>("dumphoops-show-draft-tab", false);
  return { showDraftTab, setShowDraftTab };
};

export const useTradeVisibility = () => {
  const [showTradeTab, setShowTradeTab] = usePersistedState<boolean>("dumphoops-show-trade-tab", false);
  return { showTradeTab, setShowTradeTab };
};
