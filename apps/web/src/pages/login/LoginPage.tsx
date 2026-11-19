import { Brand } from '@/components/Brand';
import { PRODUCT_NAME } from '@/modules/product';
import { LoginForm } from './components/LoginForm';

type LoginPageProps = {
  error: string;
  pending: boolean;
  onLogin: (input: { username: string; password: string }) => Promise<void>;
};

export function LoginPage({ error, pending, onLogin }: LoginPageProps) {
  return (
    <div className="login-page">
      <aside className="login-brand-panel" aria-label="产品介绍">
        <div className="login-brand-glow" aria-hidden />
        <div className="login-brand-grid" aria-hidden />
        <div className="login-brand-content">
          <Brand large />
          <ul className="login-brand-points">
            <li>按需配置 CPU / 内存 / 磁盘</li>
            <li>一键创建，秒级就绪</li>
            <li>公网直连，开箱即用</li>
          </ul>
        </div>
        <p className="login-brand-foot">{PRODUCT_NAME}</p>
      </aside>

      <main className="login-form-panel">
        <div className="login-form-shell">
          <div className="login-form-heading">
            <h1>登录</h1>
            <p>使用账号进入沙箱控制台</p>
          </div>
          <LoginForm error={error} pending={pending} onSubmit={onLogin} />
        </div>
      </main>
    </div>
  );
}