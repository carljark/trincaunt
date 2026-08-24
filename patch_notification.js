const fs = require('fs');
let file = fs.readFileSync('client/src/contexts/NotificationContext.tsx', 'utf8');

file = file.replace(
  /const \[jobs, setJobs\] = useState<BackgroundJob\[\]>\(\[\]\);/,
  `const [jobs, setJobs] = useState<BackgroundJob[]>(() => {
    const saved = localStorage.getItem('trincaunt_jobs');
    return saved ? JSON.parse(saved) : [];
  });`
);

file = file.replace(
  /const \[unreadCount, setUnreadCount\] = useState\(0\);/,
  `const [unreadCount, setUnreadCount] = useState(() => {
    const saved = localStorage.getItem('trincaunt_unread');
    return saved ? parseInt(saved, 10) : 0;
  });

  // Keep localStorage in sync
  React.useEffect(() => {
    localStorage.setItem('trincaunt_jobs', JSON.stringify(jobs));
  }, [jobs]);

  React.useEffect(() => {
    localStorage.setItem('trincaunt_unread', unreadCount.toString());
  }, [unreadCount]);`
);

fs.writeFileSync('client/src/contexts/NotificationContext.tsx', file);
