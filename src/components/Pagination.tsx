interface PaginationProps {
  page: number;
  pageSize: number;
  count: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

export default function Pagination({ page, pageSize, count, loading, onPageChange, onPageSizeChange }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  return (
    <nav aria-label="列表分页" className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-outline pt-3 text-sm">
      <span role="status">共 {count} 条 · 第 {page} / {pages} 页</span>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2">每页
          <select className="select !w-auto" aria-label="每页条数" value={pageSize} disabled={loading} onChange={event => onPageSizeChange(Number(event.target.value))}>
            {[20, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
        <button className="btn btn-ghost btn--sm" type="button" disabled={loading || page <= 1} onClick={() => onPageChange(page - 1)}>上一页</button>
        <button className="btn btn-ghost btn--sm" type="button" disabled={loading || page >= pages} onClick={() => onPageChange(page + 1)}>下一页</button>
      </div>
    </nav>
  );
}
