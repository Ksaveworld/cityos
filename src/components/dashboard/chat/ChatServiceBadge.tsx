import { CircleAlert, LoaderCircle, Radio } from 'lucide-react'

import type { CityChatStatusState } from './useCityChatStatus'

export function ChatServiceBadge({ status }: { status: CityChatStatusState; compact?: boolean }) {
  if (status.state === 'loading') {
    return <span className="flex items-center gap-1 rounded-full border border-line bg-sunken px-2 py-1 text-[9px] font-semibold text-ink-3"><LoaderCircle size={10} className="animate-spin" />检测服务</span>
  }
  if (status.state === 'unreachable') {
    return <span className="flex items-center gap-1 rounded-full border border-[#F0D8A8] bg-[#FFF8E8] px-2 py-1 text-[9px] font-semibold text-[#8A5A13]"><CircleAlert size={10} />服务不可达</span>
  }
  if (!status.value.configured) {
    return <span className="flex items-center gap-1 rounded-full border border-[#F0D8A8] bg-[#FFF8E8] px-2 py-1 text-[9px] font-semibold text-[#8A5A13]"><CircleAlert size={10} />智能服务待配置</span>
  }
  return <span className="flex items-center gap-1 rounded-full border border-[#BFE5D3] bg-[#EDF9F3] px-2 py-1 text-[9px] font-semibold text-[#237A52]"><Radio size={10} />智能服务已连接</span>
}
