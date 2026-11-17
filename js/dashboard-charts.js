// Campus Connect One - Dashboard Visualization Engine
// Powered by Recharts for real-time campus activity analytics.

/**
 * Renders the 'Campus Pulse' activity trend chart.
 * Visualizes new posts and active issues over the last 7 days.
 */
export async function renderCampusPulseChart() {
  const container = document.getElementById('campusPulseChart');
  if (!container) return;

  try {
    // Load React and Recharts dependencies from vendor (node_modules via server route)
    // We use unpkg as a reliable fallback if vendor path issues occur in some environments
    const [React, ReactDOM] = await Promise.all([
      import('https://unpkg.com/react@18/umd/react.production.min.js').then(() => window.React),
      import('https://unpkg.com/react-dom@18/umd/react-dom.production.min.js').then(() => window.ReactDOM)
    ]);

    await import('https://unpkg.com/recharts@2.12.7/umd/Recharts.js');
    const { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } = window.Recharts;

    // Generate dummy trend data (In a real app, this would fetch aggregates from Firestore)
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const data = days.map(day => ({
      name: day,
      posts: Math.floor(Math.random() * 40) + 10,
      issues: Math.floor(Math.random() * 15) + 5
    }));

    // Define the Chart Component using standard React.createElement (No JSX needed)
    const PulseChart = () => {
      return React.createElement(ResponsiveContainer, { width: '100%', height: '100%' },
        React.createElement(AreaChart, { data: data, margin: { top: 5, right: 0, left: -20, bottom: 0 } },
          React.createElement(CartesianGrid, { strokeDasharray: '3 3', vertical: false, stroke: 'rgba(255,255,255,0.05)' }),
          React.createElement(XAxis, { 
            dataKey: 'name', 
            axisLine: false, 
            tickLine: false, 
            tick: { fill: 'rgba(255,255,255,0.4)', fontSize: 10 } 
          }),
          React.createElement(YAxis, { 
            axisLine: false, 
            tickLine: false, 
            tick: { fill: 'rgba(255,255,255,0.4)', fontSize: 10 } 
          }),
          React.createElement(Tooltip, {
            contentStyle: { 
              backgroundColor: '#1a1a24', 
              border: '1px solid rgba(255,255,255,0.1)', 
              borderRadius: '8px',
              fontSize: '12px'
            },
            itemStyle: { padding: '2px 0' }
          }),
          React.createElement(Area, {
            type: 'monotone',
            dataKey: 'posts',
            stroke: '#5b5cf0',
            strokeWidth: 3,
            fillOpacity: 1,
            fill: 'url(#colorPosts)'
          }),
          React.createElement(Area, {
            type: 'monotone',
            dataKey: 'issues',
            stroke: '#f43f5e',
            strokeWidth: 3,
            fillOpacity: 1,
            fill: 'url(#colorIssues)'
          }),
          // Add Gradients
          React.createElement('defs', null,
            React.createElement('linearGradient', { id: 'colorPosts', x1: '0', y1: '0', x2: '0', y2: '1' },
              React.createElement('stop', { offset: '5%', stopColor: '#5b5cf0', stopOpacity: 0.3 }),
              React.createElement('stop', { offset: '95%', stopColor: '#5b5cf0', stopOpacity: 0 })
            ),
            React.createElement('linearGradient', { id: 'colorIssues', x1: '0', y1: '0', x2: '0', y2: '1' },
              React.createElement('stop', { offset: '5%', stopColor: '#f43f5e', stopOpacity: 0.3 }),
              React.createElement('stop', { offset: '95%', stopColor: '#f43f5e', stopOpacity: 0 })
            )
          )
        )
      );
    };

    const root = ReactDOM.createRoot(container);
    root.render(React.createElement(PulseChart));

  } catch (err) {
    console.error('[CampusPulse] Visualization error:', err);
    container.innerHTML = `<div class="small muted" style="padding:20px;text-align:center">Failed to load activity trends.</div>`;
  }
}
