import { useEffect, useState } from 'react';
import { X, Clock, AlertCircle, CheckCircle2, Loader2, Play } from 'lucide-react';
import { api, type AnalysisPollResponse } from '../api/client';
import { formatDistanceToNow } from 'date-fns';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
}

export default function HistoryDrawer({ isOpen, onClose, onSelect }: Props) {
  const [history, setHistory] = useState<AnalysisPollResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    
    let mounted = true;
    const fetchHistory = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.listAnalyses();
        if (mounted) setHistory(data);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'Failed to load history');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    
    fetchHistory();
    return () => { mounted = false; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-fade-in"
        onClick={onClose}
      />
      <div 
        className="fixed inset-y-0 right-0 w-full sm:w-96 bg-gray-900 border-l border-gray-800 shadow-2xl z-50 flex flex-col transform transition-transform duration-300 ease-in-out"
        style={{ transform: isOpen ? 'translateX(0)' : 'translateX(100%)' }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-900/90 backdrop-blur">
          <div className="flex items-center gap-2 text-gray-200 font-semibold">
            <Clock className="w-4 h-4 text-blue-400" />
            Analysis History
          </div>
          <button 
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-300 transition-colors rounded-lg hover:bg-gray-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {loading && history.length === 0 ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-red-950/30 border border-red-800/50 flex flex-col items-center text-center">
              <AlertCircle className="w-6 h-6 text-red-400 mb-2" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          ) : history.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-gray-800 rounded-xl bg-gray-900/50">
              <Clock className="w-8 h-8 text-gray-700 mx-auto mb-3" />
              <p className="text-sm text-gray-400 font-medium">No recent analyses</p>
              <p className="text-xs text-gray-600 mt-1">Your past analysis runs will appear here.</p>
            </div>
          ) : (
            history.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  onSelect(item.id);
                  onClose();
                }}
                className="w-full text-left p-4 rounded-xl border border-gray-800/60 bg-gray-950 hover:border-blue-800/50 hover:bg-blue-950/10 transition-all group"
              >
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs font-mono text-gray-500 truncate max-w-[200px]" title={item.repositoryPath}>
                    {item.repositoryPath}
                  </span>
                  {item.status === 'complete' ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                  ) : item.status === 'error' ? (
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  ) : (
                    <Loader2 className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />
                  )}
                </div>
                
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-gray-600">
                    {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                  </span>
                  <span className="text-xs font-medium text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                    <Play className="w-3 h-3" /> View
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );
}
