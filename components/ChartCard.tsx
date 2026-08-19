import type { ReactNode } from "react";
import { Info } from "lucide-react";
export function ChartCard({ title, subtitle, tag, className = "", children }: { title: string; subtitle: string; tag?: string; className?: string; children: ReactNode }) { return <article className={`chart-card ${className}`}><header className="card-header"><div><h2>{title}</h2><p>{subtitle}</p></div>{tag ? <span className="card-tag">{tag}</span> : <Info className="info-icon" size={16} />}</header><div className="chart-body">{children}</div></article>; }
