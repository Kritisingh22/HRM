/* Generic workspace page: a titled card with a scoped data table. Most nav
 * items in every workspace are instances of this — the difference between roles
 * is which endpoint they hit and how the backend scopes the response. */
import { Card } from '../../components/ui';
import ResourceTable from '../../components/ResourceTable';

export default function ResourcePage({ title, sub, endpoint, columns, filter, scopeNote }) {
  return (
    <div className="ws-page">
      <div className="ws-page-head">
        <h1>{title}</h1>
        {scopeNote && <span className="ws-scope">{scopeNote}</span>}
      </div>
      <Card sub={sub}>
        <ResourceTable endpoint={endpoint} columns={columns} filter={filter} />
      </Card>
    </div>
  );
}
