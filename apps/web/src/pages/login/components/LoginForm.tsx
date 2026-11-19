import { Alert, Button, Form, Input } from 'antd';

type LoginValues = {
  username: string;
  password: string;
};

type LoginFormProps = {
  error: string;
  pending: boolean;
  onSubmit: (input: { username: string; password: string }) => Promise<void>;
};

export function LoginForm({ error, pending, onSubmit }: LoginFormProps) {
  return (
    <Form<LoginValues>
      layout="vertical"
      requiredMark={false}
      onFinish={(values) => void onSubmit({
        username: values.username.trim(),
        password: values.password,
      })}
      initialValues={{ username: '', password: '' }}
      className="login-form"
    >
      <Form.Item
        label="用户名"
        name="username"
        rules={[{ required: true, message: '请输入用户名' }]}
      >
        <Input size="large" autoComplete="username" placeholder="请输入用户名" />
      </Form.Item>
      <Form.Item
        label="密码"
        name="password"
        rules={[{ required: true, message: '请输入密码' }]}
      >
        <Input.Password
          size="large"
          autoComplete="current-password"
          placeholder="请输入密码"
        />
      </Form.Item>
      {error ? (
        <Alert
          type="error"
          showIcon
          title={error}
          style={{ marginBottom: 16 }}
        />
      ) : null}
      <Button
        type="primary"
        htmlType="submit"
        size="large"
        block
        loading={pending}
        className="login-submit"
      >
        登录
      </Button>
    </Form>
  );
}