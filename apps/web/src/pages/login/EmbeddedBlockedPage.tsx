import { Result } from 'antd';

export function EmbeddedBlockedPage({ message }: { message?: string }) {
  return (
    <div
      style={{
        height: '100%',
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
    >
      <Result status="warning" title={message || '请从 Harness Admin 打开'} />
    </div>
  );
}
