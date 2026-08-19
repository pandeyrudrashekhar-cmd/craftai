import dns from 'node:dns/promises';

export function normalizeCustomDomain(value) {
  if (typeof value !== 'string') return '';

  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return '';

  const withoutProtocol = trimmed.replace(/^https?:\/\//, '').replace(/^\/\//, '');
  const host = withoutProtocol.split(/[/?#]/)[0].replace(/:\d+$/, '').trim();

  return host.replace(/\.+$/, '');
}

export function isValidCustomDomain(value) {
  if (typeof value !== 'string') return false;

  if (value.includes('://') || value.includes('/')) {
    return false;
  }

  const domain = normalizeCustomDomain(value);
  if (!domain || domain.includes(' ')) return false;
  if (domain.startsWith('.') || domain.endsWith('.')) return false;
  if (domain.split('.').length < 2) return false;

  const domainRegex = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
  return domainRegex.test(domain);
}

export function buildCustomDomainInstructions(domain) {
  const normalized = normalizeCustomDomain(domain);

  if (!normalized) {
    return {
      type: 'CNAME',
      name: 'www',
      value: '',
      instructions: 'Enter a valid domain to generate DNS instructions.'
    };
  }

  return {
    type: 'CNAME',
    name: 'www',
    value: process.env.CUSTOM_DOMAIN_TARGET || '',
    instructions: process.env.CUSTOM_DOMAIN_TARGET
      ? `Create a CNAME record for www pointing to ${process.env.CUSTOM_DOMAIN_TARGET}.`
      : 'Custom-domain provisioning is not configured on this server.'
  };
}

export async function verifyCustomDomainRecord(domain) {
  const normalized = normalizeCustomDomain(domain);
  const target = String(process.env.CUSTOM_DOMAIN_TARGET || '').trim().toLowerCase().replace(/\.+$/, '');
  const candidates = [...new Set([
    normalized,
    normalized.startsWith('www.') ? normalized : `www.${normalized}`
  ].filter(Boolean))];

  if (!normalized || !target) {
    return {
      verified: false,
      target,
      candidates: [],
      reason: normalized ? 'Custom-domain provisioning is not configured.' : 'The domain is empty.'
    };
  }

  try {
    const records = (await Promise.all(candidates.map((candidate) => dns.resolveCname(candidate).catch(() => [])))).flat();
    const verified = records.some((value) => String(value).trim().toLowerCase().replace(/\.+$/, '') === target);

    return {
      verified,
      target,
      candidates,
      reason: verified
        ? 'DNS CNAME record matches the configured CraftAI target.'
        : 'DNS verification could not confirm the configured CraftAI target.'
    };
  } catch {
    return {
      verified: false,
      target,
      candidates,
      reason: 'DNS verification could not be completed from this environment.'
    };
  }
}