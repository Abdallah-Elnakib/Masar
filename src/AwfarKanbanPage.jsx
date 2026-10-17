import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, Layers, RefreshCw, Search, Users } from "lucide-react";
import "./awfar-kanban-page.css";

export default function AwfarKanbanPage() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [exportMessage, setExportMessage] = useState("");
  const [query, setQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState("all");

  const loadReport = useCallback(async () => {
    if (report) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      if (!window.qaDesk?.awfarKanban?.summary) {
        throw new Error("Awfar Kanban is unavailable. Restart the desktop app.");
      }
      const result = await window.qaDesk.awfarKanban.summary();
      if (!result.ok) throw new Error(result.message || "Awfar Kanban report could not be loaded.");
      setReport(result);
    } catch (loadError) {
      setError(loadError.message || "Awfar Kanban report could not be loaded.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [report]);

  useEffect(() => { void loadReport(); }, []);

  const teams = useMemo(
    () => [...new Set((report?.employees || []).map((employee) => employee.teamName).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [report],
  );

  const filteredEmployees = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return (report?.employees || []).filter((employee) => {
      if (teamFilter !== "all" && employee.teamName !== teamFilter) return false;
      if (!normalizedQuery) return true;
      return [employee.fullName, employee.awfarUser, employee.employeeType, employee.teamName]
        .some((value) => String(value || "").toLocaleLowerCase().includes(normalizedQuery));
    });
  }, [query, report, teamFilter]);

  const employeesWithCases = useMemo(() => filteredEmployees
    .map((employee) => ({
      ...employee,
      campaigns: employee.campaigns.filter((campaign) => {
        const unavailableStatuses = new Set((report?.failedJobs || [])
          .filter((job) => job.campaignName === campaign.name)
          .map((job) => job.statusKey));
        return Object.entries(campaign.counts).some(([statusKey, count]) => (
          !unavailableStatuses.has(statusKey) && Number(count) > 0
        )) || unavailableStatuses.size > 0;
      }),
    }))
    .filter((employee) => employee.campaigns.length > 0), [filteredEmployees, report]);

  const positiveCampaigns = useMemo(() => {
    let count = 0;
    for (const employee of employeesWithCases) {
      for (const campaign of employee.campaigns) {
        if (Object.values(campaign.counts).some((value) => Number(value) > 0)) count += 1;
      }
    }
    return count;
  }, [employeesWithCases]);

  async function exportExcel() {
    if (!report || !employeesWithCases.length || exporting) return;
    setExporting(true);
    setExportMessage("");
    setError("");
    try {
      const module = await import("xlsx-js-style");
      const XLSX = module.default || module;
      const generatedAt = new Date();
      const statuses = report.statuses;
      const unavailable = new Set((report.failedJobs || []).map((job) => `${job.campaignName}\u0000${job.statusKey}`));
      const detailHeaders = ["Employee", "Awfar User", "Employee Type", "Team", "Campaign", ...statuses.map((status) => status.label), "Status Total"];
      const detailData = employeesWithCases.flatMap((employee) => employee.campaigns.map((campaign) => {
        const rowCounts = statuses.map((status) => unavailable.has(`${campaign.name}\u0000${status.key}`)
          ? null
          : Number(campaign.counts[status.key]) || 0);
        return [
          employee.fullName,
          employee.awfarUser,
          employee.employeeType || "",
          employee.teamName || "Unassigned",
          campaign.name,
          ...rowCounts,
          rowCounts.reduce((sum, count) => sum + (count || 0), 0),
        ];
      }));
      const detailsRows = [
        ["NORTHSTAR | AWFAR KANBAN DETAILS"],
        [`Generated: ${generatedAt.toLocaleString()}`],
        [`Applied filters: Team: ${teamFilter === "all" ? "All teams" : teamFilter} | Search: ${query.trim() || "All employees"}`],
        [`Employees: ${employeesWithCases.length} | Campaign rows: ${detailData.length} | Unavailable statuses: ${(report.failedJobs || []).length} | Unavailable values are left blank.`],
        [],
        detailHeaders,
        ...detailData,
      ];
      const detailsSheet = XLSX.utils.aoa_to_sheet(detailsRows);
      const lastCol = detailHeaders.length - 1;
      const headerRow = 5;
      detailsSheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } }];
      detailsSheet["!cols"] = [{ wch: 25 }, { wch: 22 }, { wch: 17 }, { wch: 22 }, { wch: 27 }, ...statuses.map(() => ({ wch: 15 })), { wch: 16 }];
      detailsSheet["!rows"] = [{ hpt: 32 }, { hpt: 21 }, { hpt: 24 }, { hpt: 22 }, { hpt: 8 }, { hpt: 28 }, ...detailData.map(() => ({ hpt: 21 }))];
      detailsSheet["!autofilter"] = { ref: `A6:${XLSX.utils.encode_cell({ r: detailsRows.length - 1, c: lastCol })}` };
      detailsSheet["!views"] = [{ state: "frozen", ySplit: headerRow + 1, topLeftCell: `A${headerRow + 2}`, activePane: "bottomLeft" }];
      detailsSheet["!pageSetup"] = { orientation: "landscape", fitToWidth: 1, fitToHeight: 0 };
      detailsSheet.A1.s = {
        fill: { fgColor: { rgb: "173B28" } },
        font: { name: "Aptos Display", sz: 17, bold: true, color: { rgb: "FFFFFF" } },
        alignment: { vertical: "center", indent: 1 },
      };
      for (let row = 1; row <= 3; row += 1) {
        const cell = detailsSheet[`A${row + 1}`];
        if (cell) cell.s = { font: { color: { rgb: "52645A" }, italic: row === 1 }, alignment: { vertical: "center", wrapText: true } };
      }
      for (let col = 0; col <= lastCol; col += 1) {
        const address = XLSX.utils.encode_cell({ r: headerRow, c: col });
        detailsSheet[address].s = {
          fill: { fgColor: { rgb: "286343" } },
          font: { name: "Aptos", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
          alignment: { horizontal: "center", vertical: "center", wrapText: true },
          border: { bottom: { style: "medium", color: { rgb: "1D5738" } } },
        };
      }
      for (let row = headerRow + 1; row < detailsRows.length; row += 1) {
        for (let col = 0; col <= lastCol; col += 1) {
          const address = XLSX.utils.encode_cell({ r: row, c: col });
          const cell = detailsSheet[address];
          if (!cell) continue;
          cell.s = {
            fill: { fgColor: { rgb: row % 2 ? "F2F7F2" : "FFFFFF" } },
            font: { color: { rgb: "26382D" }, bold: col === lastCol },
            alignment: { vertical: "center", horizontal: col >= 5 ? "center" : "left" },
            border: { bottom: { style: "thin", color: { rgb: "D9E3DA" } } },
          };
          if (col >= 5 && cell.v !== null && cell.v !== undefined) cell.z = "#,##0";
        }
      }

      const employeeRows = employeesWithCases.map((employee) => {
        const employeeStatusTotals = statuses.map((status) => employee.campaigns.reduce((sum, campaign) => (
          unavailable.has(`${campaign.name}\u0000${status.key}`)
            ? sum
            : sum + (Number(campaign.counts[status.key]) || 0)
        ), 0));
        return [
          employee.fullName,
          employee.awfarUser,
          employee.employeeType || "",
          employee.teamName || "Unassigned",
          ...employeeStatusTotals,
          employeeStatusTotals.reduce((sum, count) => sum + count, 0),
        ];
      });
      const summaryHeaders = ["Employee", "Awfar User", "Employee Type", "Team", ...statuses.map((status) => status.label), "Status Total"];
      const summaryRows = [
        ["NORTHSTAR | AWFAR KANBAN SUMMARY"],
        [`Generated: ${generatedAt.toLocaleString()}`],
        [`Team filter: ${teamFilter === "all" ? "All teams" : teamFilter} | Search: ${query.trim() || "All employees"}`],
        ["Employees", employeesWithCases.length, "Campaigns per employee", report.campaigns.length, "Employee-campaign rows with cases", positiveCampaigns],
        ["Unavailable campaign statuses", (report.failedJobs || []).length, "Report refreshed", report.fetchedAt ? new Date(report.fetchedAt).toLocaleString() : "Unknown"],
        ["Note", "Unavailable status values are excluded from totals."],
        [],
        summaryHeaders,
        ...employeeRows,
      ];
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
      const summaryLastCol = summaryHeaders.length - 1;
      summarySheet["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: summaryLastCol } },
        { s: { r: 5, c: 1 }, e: { r: 5, c: summaryLastCol } },
      ];
      summarySheet["!cols"] = [{ wch: 25 }, { wch: 22 }, { wch: 17 }, { wch: 22 }, ...statuses.map(() => ({ wch: 15 })), { wch: 16 }];
      summarySheet["!rows"] = [{ hpt: 32 }, { hpt: 21 }, { hpt: 22 }, { hpt: 22 }, { hpt: 22 }, { hpt: 22 }, { hpt: 8 }, { hpt: 28 }, ...employeeRows.map(() => ({ hpt: 22 }))];
      summarySheet["!autofilter"] = { ref: `A8:${XLSX.utils.encode_cell({ r: summaryRows.length - 1, c: summaryLastCol })}` };
      summarySheet["!views"] = [{ state: "frozen", ySplit: 8, topLeftCell: "A9", activePane: "bottomLeft" }];
      summarySheet["!pageSetup"] = { orientation: "landscape", fitToWidth: 1, fitToHeight: 0 };
      summarySheet.A1.s = {
        fill: { fgColor: { rgb: "173B28" } },
        font: { name: "Aptos Display", sz: 17, bold: true, color: { rgb: "FFFFFF" } },
        alignment: { vertical: "center", indent: 1 },
      };
      for (let col = 0; col <= summaryLastCol; col += 1) {
        const address = XLSX.utils.encode_cell({ r: 7, c: col });
        summarySheet[address].s = {
          fill: { fgColor: { rgb: "286343" } },
          font: { name: "Aptos", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
          alignment: { horizontal: "center", vertical: "center", wrapText: true },
        };
      }
      for (let row = 8; row < summaryRows.length; row += 1) {
        for (let col = 0; col <= summaryLastCol; col += 1) {
          const address = XLSX.utils.encode_cell({ r: row, c: col });
          const cell = summarySheet[address];
          if (!cell) continue;
          cell.s = {
            fill: { fgColor: { rgb: row % 2 ? "F2F7F2" : "FFFFFF" } },
            font: { color: { rgb: "26382D" }, bold: col === summaryLastCol },
            alignment: { vertical: "center", horizontal: col >= 4 ? "center" : "left" },
            border: { bottom: { style: "thin", color: { rgb: "D9E3DA" } } },
          };
          if (col >= 4 && cell.v !== null && cell.v !== undefined) cell.z = "#,##0";
        }
      }

      const qualityHeaders = ["Campaign", "Status", "API response"];
      const qualityRows = [
        ["NORTHSTAR | AWFAR DATA QUALITY"],
        [`Generated: ${generatedAt.toLocaleString()}`],
        ["Unavailable status values are shown as blanks in Campaign Details and excluded from totals."],
        [],
        qualityHeaders,
        ...(report.failedJobs || []).map((job) => [job.campaignName, job.statusLabel, job.message]),
      ];
      if (!(report.failedJobs || []).length) qualityRows.push(["All campaigns", "All statuses", "All campaign statuses loaded successfully."]);
      const qualitySheet = XLSX.utils.aoa_to_sheet(qualityRows);
      const qualityLastRow = qualityRows.length - 1;
      qualitySheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: qualityHeaders.length - 1 } }];
      qualitySheet["!cols"] = [{ wch: 30 }, { wch: 20 }, { wch: 82 }];
      qualitySheet["!rows"] = [{ hpt: 32 }, { hpt: 21 }, { hpt: 24 }, { hpt: 8 }, { hpt: 26 }, ...qualityRows.slice(5).map(() => ({ hpt: 24 }))];
      qualitySheet["!autofilter"] = { ref: `A5:C${qualityLastRow}` };
      qualitySheet["!views"] = [{ state: "frozen", ySplit: 5, topLeftCell: "A6", activePane: "bottomLeft" }];
      qualitySheet["!pageSetup"] = { orientation: "landscape", fitToWidth: 1, fitToHeight: 0 };
      qualitySheet.A1.s = {
        fill: { fgColor: { rgb: "173B28" } },
        font: { name: "Aptos Display", sz: 17, bold: true, color: { rgb: "FFFFFF" } },
        alignment: { vertical: "center", indent: 1 },
      };
      qualitySheet.A2.s = { font: { color: { rgb: "52645A" }, italic: true } };
      qualitySheet.A3.s = { font: { color: { rgb: "785C1D" } }, alignment: { vertical: "center", wrapText: true } };
      for (let col = 0; col < qualityHeaders.length; col += 1) {
        qualitySheet[XLSX.utils.encode_cell({ r: 4, c: col })].s = {
          fill: { fgColor: { rgb: "286343" } },
          font: { bold: true, color: { rgb: "FFFFFF" } },
          alignment: { horizontal: "center", vertical: "center" },
        };
      }
      for (let row = 5; row <= qualityLastRow; row += 1) {
        for (let col = 0; col < qualityHeaders.length; col += 1) {
          const cell = qualitySheet[XLSX.utils.encode_cell({ r: row, c: col })];
          if (!cell) continue;
          cell.s = {
            fill: { fgColor: { rgb: row % 2 ? "FFF7E8" : "FFFFFF" } },
            font: { color: { rgb: "493B20" } },
            alignment: { vertical: "center", wrapText: col === 2 },
            border: { bottom: { style: "thin", color: { rgb: "E8DEC9" } } },
          };
        }
      }

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, summarySheet, "Employee Summary");
      XLSX.utils.book_append_sheet(workbook, detailsSheet, "Campaign Details");
      XLSX.utils.book_append_sheet(workbook, qualitySheet, "Data Quality");
      workbook.Props = {
        Title: "Awfar Kanban Report",
        Subject: `Awfar campaign statuses · ${generatedAt.toLocaleDateString()}`,
        Author: "Northstar Quality Operations",
      };
      const datePart = generatedAt.toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `Awfar_Kanban_${datePart}.xlsx`, { compression: true });
      setExportMessage(`Exported ${employeesWithCases.length} employees and ${detailData.length} campaign rows using the current filters.`);
    } catch (exportError) {
      console.error("Awfar Kanban Excel export failed:", exportError);
      setError("Excel export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="awfar-kanban-page">
      <header className="awfar-kanban-heading">
        <div>
          <span className="awfar-kanban-eyebrow">AWFAR CAMPAIGN MONITOR</span>
          <h2><Layers size={22} /> Awfar Kanban</h2>
          <p>Campaign cases grouped by employee Awfar User and current status.</p>
        </div>
        <button type="button" className="awfar-kanban-refresh" onClick={() => void loadReport()} disabled={loading || refreshing}>
          <RefreshCw size={15} className={refreshing ? "is-spinning" : ""} />
          {refreshing ? "Refreshing..." : "Refresh report"}
        </button>
        <button type="button" className="awfar-kanban-export" onClick={() => void exportExcel()} disabled={!report || loading || exporting || !employeesWithCases.length}>
          {exporting ? <RefreshCw size={15} className="is-spinning" /> : <FileSpreadsheet size={15} />}
          {exporting ? "Preparing Excel..." : "Export Excel"}
        </button>
      </header>

      {error && <div className="awfar-kanban-error" role="alert">{error}</div>}
      {exportMessage && <div className="awfar-kanban-export-message" role="status"><Download size={14} />{exportMessage}</div>}
      {report?.failedJobs?.length > 0 && (
        <div className="awfar-kanban-warning" role="status">
          Some campaign statuses could not be loaded after retries ({report.failedJobs.length}). Unavailable values are shown as —. {report.failedJobs.slice(0, 5).map((job) => `${job.campaignName} / ${job.statusLabel}: ${job.message}`).join(" · ")}
          {report.failedJobs.length > 5 && ` · and ${report.failedJobs.length - 5} more`}
        </div>
      )}

      <section className="awfar-kanban-stats" aria-label="Report summary">
        <article><Users size={17} /><span>Employees with cases</span><strong>{report ? employeesWithCases.length : "—"}</strong></article>
        <article><Layers size={17} /><span>Campaigns per employee</span><strong>{report?.campaigns.length || "—"}</strong></article>
        <article><span className="awfar-kanban-stat-dot" /><span>Employee campaigns with cases</span><strong>{report ? positiveCampaigns : "—"}</strong></article>
        <small>{report?.fetchedAt ? `Last updated ${new Date(report.fetchedAt).toLocaleString()}` : "Refresh to load live Awfar data"}</small>
      </section>

      <div className="awfar-kanban-filters">
        <label className="awfar-kanban-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search employee, Awfar User or team" aria-label="Search Awfar Kanban employees" /></label>
        <label><span>Team</span><select value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)}><option value="all">All teams</option>{teams.map((team) => <option key={team} value={team}>{team}</option>)}</select></label>
      </div>

      {loading ? (
        <div className="awfar-kanban-loading">Loading campaign statuses from Awfar...</div>
      ) : report && employeesWithCases.length === 0 ? (
        <div className="awfar-kanban-empty">{report.employees.length ? "No matching employees have cases in the loaded campaign statuses." : "No active employees have an Awfar User value assigned."}</div>
      ) : report && (
        <div className="awfar-kanban-table-wrap">
          <table className="awfar-kanban-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Awfar User</th>
                <th>Team</th>
                <th>Campaign</th>
                {report.statuses.map((status) => <th key={status.key} className={`status-${status.key}`}>{status.label}</th>)}
                <th>All statuses</th>
              </tr>
            </thead>
            <tbody>
              {employeesWithCases.flatMap((employee) => employee.campaigns.map((campaign) => {
                const failedKeys = new Set((report.failedJobs || []).filter((job) => job.campaignName === campaign.name).map((job) => job.statusKey));
                const counts = report.statuses.map((status) => failedKeys.has(status.key) ? null : Number(campaign.counts[status.key]) || 0);
                const total = counts.reduce((sum, count) => sum + (count || 0), 0);
                return (
                  <tr key={`${employee.employeeId}-${campaign.name}`} className={total > 0 ? "has-cases" : ""}>
                    <td><strong>{employee.fullName}</strong><small>{employee.employeeType}</small></td>
                    <td>{employee.awfarUser}</td>
                    <td>{employee.teamName}</td>
                    <td className="awfar-kanban-campaign">{campaign.name}</td>
                    {report.statuses.map((status, index) => {
                      const unavailable = failedKeys.has(status.key);
                      return <td key={status.key} className={`awfar-kanban-count status-${status.key} ${unavailable ? "is-unavailable" : ""}`}>{unavailable ? "—" : counts[index].toLocaleString()}</td>;
                    })}
                    <td className="awfar-kanban-total">{total.toLocaleString()}</td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </div>
      )}
      {report && <footer className="awfar-kanban-footer">{employeesWithCases.length} employees · {positiveCampaigns} employee-campaign rows have cases · Unread is an independent status filter and can overlap other statuses.</footer>}
    </section>
  );
}
