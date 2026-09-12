import { memo } from 'react';
import { GitHubIcon, LinkedInIcon } from './icons.jsx';

const LINKS = [
  {
    href: 'https://linkedin.com/in/sumanyuj',
    label: 'LinkedIn',
    Icon: LinkedInIcon
  },
  { href: 'https://github.com/sumanyuj', label: 'GitHub', Icon: GitHubIcon }
];

function SocialLinks() {
  return (
    <nav className="social" aria-label="Social links">
      {LINKS.map(({ href, label, Icon }) => (
        <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label}>
          <Icon className="social__icon" />
        </a>
      ))}
    </nav>
  );
}

export default memo(SocialLinks);
