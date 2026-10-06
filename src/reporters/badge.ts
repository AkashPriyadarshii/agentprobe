export function generateBadge(score: number): string {
  let color = 'red';
  if (score >= 90) color = 'brightgreen';
  else if (score >= 80) color = 'green';
  else if (score >= 70) color = 'yellow';
  else if (score >= 50) color = 'orange';

  const badgeUrl = `https://img.shields.io/badge/Agent_Readiness-${score}%2F100-${color}?style=flat-square`;
  return `[![Agent Readiness](${badgeUrl})](https://github.com/AkashPriyadarshii/agentprobe)`;
}
