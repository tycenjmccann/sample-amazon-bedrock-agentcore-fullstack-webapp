import SideNavigation from '@cloudscape-design/components/side-navigation';
import { useNavigate, useLocation } from 'react-router-dom';

export default function Navigation() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <SideNavigation
      activeHref={location.pathname}
      header={{ href: '/', text: 'AgentCore Operations' }}
      onFollow={(event) => {
        if (!event.detail.external) {
          event.preventDefault();
          navigate(event.detail.href);
        }
      }}
      items={[
        { type: 'link', text: 'Dashboard', href: '/' },
        { type: 'link', text: 'Agent Builder', href: '/agents' },
        { type: 'link', text: 'Chat', href: '/chat' },
        { type: 'divider' },
        {
          type: 'section',
          text: 'AgentCore Features',
          items: [
            { type: 'link', text: 'MCP Gateway', href: '/gateways' },
            { type: 'link', text: 'Memory', href: '/memory' },
            { type: 'link', text: 'Evaluations', href: '/evaluations' },
            { type: 'link', text: 'Policies', href: '/policies' },
          ],
        },
        { type: 'divider' },
        {
          type: 'link',
          text: 'AWS MCP Servers',
          href: 'https://github.com/awslabs/mcp',
          external: true,
        },
        {
          type: 'link',
          text: 'AgentCore Docs',
          href: 'https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/',
          external: true,
        },
      ]}
    />
  );
}
