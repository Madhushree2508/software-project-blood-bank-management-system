/**
 * Hemolink - Chart.js Visualization Integration
 */

let stockChartInstance = null;
let trendChartInstance = null;
let statusChartInstance = null;

function renderReportsCharts(data) {
  if (typeof Chart === 'undefined') {
    console.warn('Chart.js not loaded');
    return;
  }

  // 1. Stock Distribution Bar Chart
  const stockCtx = document.getElementById('chart-stock-distribution');
  if (stockCtx && data.stockDistribution) {
    if (stockChartInstance) stockChartInstance.destroy();

    const labels = data.stockDistribution.map(d => d.blood_group);
    const counts = data.stockDistribution.map(d => d.count);

    stockChartInstance = new Chart(stockCtx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Units in Stock',
          data: counts,
          backgroundColor: [
            '#e63946', '#f43f5e', '#ec4899', '#d946ef',
            '#a855f7', '#6366f1', '#3b82f6', '#0ea5e9'
          ],
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` Available: ${ctx.parsed.y} units`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { stepSize: 1 }
          }
        }
      }
    });
  }

  // 2. Monthly Trend Line Chart
  const trendCtx = document.getElementById('chart-monthly-trend');
  if (trendCtx && data.monthlyDonations) {
    if (trendChartInstance) trendChartInstance.destroy();

    const months = data.monthlyDonations.map(m => m.month);
    const donationCounts = data.monthlyDonations.map(m => m.count);

    trendChartInstance = new Chart(trendCtx, {
      type: 'line',
      data: {
        labels: months,
        datasets: [{
          label: 'Donations Collected',
          data: donationCounts,
          borderColor: '#e63946',
          backgroundColor: 'rgba(230, 57, 70, 0.12)',
          fill: true,
          tension: 0.35,
          borderWidth: 3,
          pointBackgroundColor: '#d90429',
          pointRadius: 5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });
  }

  // 3. Requests Status Doughnut Chart
  const statusCtx = document.getElementById('chart-request-status');
  if (statusCtx && data.requestStatuses) {
    if (statusChartInstance) statusChartInstance.destroy();

    const labels = data.requestStatuses.map(s => s.status);
    const counts = data.requestStatuses.map(s => s.count);

    statusChartInstance = new Chart(statusCtx, {
      type: 'doughnut',
      data: {
        labels: labels.length ? labels : ['No Requests'],
        datasets: [{
          data: counts.length ? counts : [1],
          backgroundColor: ['#f59e0b', '#10b981', '#ef4444', '#6366f1'],
          borderWidth: 2,
          borderColor: '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 12, padding: 16 }
          }
        },
        cutout: '65%'
      }
    });
  }
}
