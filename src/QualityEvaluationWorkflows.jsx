import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  Check,
  CircleAlert,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  FilePlus2,
  FileText,
  Headphones,
  Mail,
  Pencil,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";

function monthLabel(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function numberLabel(value) {
  return Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function newQuestion() {
  return { id: crypto.randomUUID(), label: "", type: "single", required: true, scored: true, options: ["Choice 1", "Choice 2"], optionScores: [0, 0] };
}

function emptyForm() {
  return { name: "", questions: [newQuestion()] };
}

function calculateFormScore(form, answers) {
  let earnedPoints = 0;
  let maximumPoints = 0;

  for (const question of form.questions) {
    if (!question.scored || !["single", "multi"].includes(question.type)) continue;
    const optionScores = question.options.map((_, index) => Number(question.optionScores?.[index] || 0));
    const selected = question.type === "multi"
      ? (Array.isArray(answers[question.id]) ? answers[question.id] : [])
      : [answers[question.id]];
    if (selected.length === 0 || (question.type === "single" && !String(selected[0] || "").trim())) continue;
    maximumPoints += question.type === "single"
      ? Math.max(...optionScores)
      : optionScores.reduce((total, points) => total + points, 0);
    earnedPoints += question.options.reduce(
      (total, option, index) => total + (selected.includes(option) ? optionScores[index] : 0),
      0,
    );
  }

  return {
    earnedPoints,
    maximumPoints,
    score: maximumPoints > 0 ? Math.round((earnedPoints / maximumPoints) * 10000) / 100 : null,
  };
}

function QuestionEditor({ question, index, onChange, onRemove }) {
  const usesOptions = question.type === "single" || question.type === "multi";

  function updateOption(optionIndex, value) {
    onChange({ ...question, options: question.options.map((option, currentIndex) => currentIndex === optionIndex ? value : option) });
  }

  function updateOptionScore(optionIndex, value) {
    onChange({ ...question, optionScores: question.options.map((_, currentIndex) => currentIndex === optionIndex ? Number(value) : Number(question.optionScores?.[currentIndex] || 0)) });
  }

  function changeType(type) {
    const hasOptions = type === "single" || type === "multi";
    const options = hasOptions ? (question.options?.length >= 2 ? question.options : ["Choice 1", "Choice 2"]) : [];
    onChange({
      ...question,
      type,
      scored: hasOptions,
      options,
      optionScores: hasOptions ? options.map((_, optionIndex) => Number(question.optionScores?.[optionIndex] || 0)) : [],
    });
  }

  return <article className="quality-question-editor">
    <header className="quality-question-editor-heading"><span className="quality-question-index">{String(index + 1).padStart(2, "0")}</span><strong>Question {index + 1}</strong><button className="quality-workflow-icon-button remove" type="button" onClick={onRemove} aria-label={`Remove question ${index + 1}`} title="Remove question"><X size={16} /></button></header>
    <div className="quality-question-fields">
      <label className="quality-workflow-field question-label-field"><span>Question text</span><input value={question.label} onChange={(event) => onChange({ ...question, label: event.target.value })} maxLength={500} placeholder="Enter your question" required /></label>
      <label className="quality-workflow-field"><span>Answer type</span><select value={question.type} onChange={(event) => changeType(event.target.value)}><option value="single">Single choice</option><option value="multi">Multiple choice</option><option value="date">Date</option><option value="text">Text answer</option></select></label>
    </div>
    {usesOptions && <div className="quality-form-options"><div className="quality-options-heading"><span>Answer choices</span><small>One choice per field</small></div>{question.options.map((option, optionIndex) => <div className={`quality-option-row ${question.scored ? "with-score" : ""}`} key={`${question.id}-${optionIndex}`}><span className={`quality-option-marker ${question.type}`} /> <input value={option} onChange={(event) => updateOption(optionIndex, event.target.value)} maxLength={200} aria-label={`Choice ${optionIndex + 1}`} placeholder={`Choice ${optionIndex + 1}`} required />{question.scored && <label className="quality-option-score"><span>Points</span><input type="number" min="0" max="1000000" step="any" value={question.optionScores?.[optionIndex] ?? 0} onChange={(event) => updateOptionScore(optionIndex, event.target.value)} aria-label={`Points for choice ${optionIndex + 1}`} required /></label>}<button type="button" className="quality-workflow-icon-button remove" onClick={() => onChange({ ...question, options: question.options.filter((_, currentIndex) => currentIndex !== optionIndex), optionScores: question.optionScores.filter((_, currentIndex) => currentIndex !== optionIndex) })} disabled={question.options.length <= 2} title="Remove choice" aria-label={`Remove choice ${optionIndex + 1}`}><X size={14} /></button></div>)}<button type="button" className="quality-add-choice" onClick={() => onChange({ ...question, options: [...question.options, ""], optionScores: [...(question.optionScores || []), 0] })}><Plus size={14} /> Add choice</button></div>}
    {usesOptions ? <label className="quality-question-required"><input type="checkbox" checked={question.scored !== false} onChange={(event) => onChange({ ...question, scored: event.target.checked })} /><span className="quality-required-check"><Check size={12} /></span><span>Include this question in the score</span></label> : <p className="quality-question-info">Information only; this answer is not included in the score.</p>}
    <label className="quality-question-required"><input type="checkbox" checked={question.required !== false} onChange={(event) => onChange({ ...question, required: event.target.checked })} /><span className="quality-required-check"><Check size={12} /></span><span>Answer required</span></label>
  </article>;
}

function FormBuilder({ form, teams, assignedTeams, saving, error, onBack, onSave }) {
  const availableTeamIds = new Set(teams.map((team) => team.id));
  const [draft, setDraft] = useState(() => form ? { ...form, teamIds: (form.teamIds || []).filter((id) => availableTeamIds.has(id)), questions: form.questions.map((question) => ({ ...question, options: question.options || [], optionScores: question.options?.map((_, index) => Number(question.optionScores?.[index] || 0)) || [], scored: question.type === "single" || question.type === "multi" ? question.scored !== false : false })) } : { ...emptyForm(), teamIds: [] });
  const maximumPoints = draft.questions.reduce((total, question) => {
    if (!question.scored || !["single", "multi"].includes(question.type)) return total;
    const points = question.options.map((_, index) => Number(question.optionScores?.[index] || 0));
    return total + (question.type === "single" ? Math.max(...points) : points.reduce((sum, value) => sum + value, 0));
  }, 0);

  function updateQuestion(id, next) {
    setDraft((current) => ({ ...current, questions: current.questions.map((question) => question.id === id ? next : question) }));
  }

  return <form className="quality-form-builder" onSubmit={(event) => { event.preventDefault(); onSave(draft); }}>
    <div className="quality-workflow-topline"><button className="quality-workflow-back" type="button" onClick={onBack}><ArrowLeft size={16} /> Forms</button><span className="quality-eyebrow">FORM BUILDER</span></div>
    <header className="quality-workflow-title"><span className="quality-workflow-title-icon"><FilePlus2 size={21} /></span><div><h2>{form ? "Edit evaluation form" : "Create evaluation form"}</h2><p>Build a reusable question set for call evaluations.</p></div></header>
    {error && <div className="quality-workflow-error" role="alert"><CircleAlert size={16} />{error}</div>}

    <section className="quality-workflow-section">
      <header className="quality-workflow-section-heading"><span className="quality-workflow-step">01</span><div><span className="quality-eyebrow">FORM DETAILS</span><h3>Name your form</h3></div></header>
      <label className="quality-workflow-field"><span>Form name</span><input autoFocus value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} maxLength={120} placeholder="e.g. Customer Support Call Review" required /></label>
      <fieldset className="quality-form-team-assignment"><legend>Teams using this form</legend><p>Each team can have only one active evaluation form. Evaluators will get the form assigned to the employee's team automatically.</p>{teams.length ? teams.map((team) => {
        const selected = draft.teamIds.includes(team.id);
        const assignedToOtherForm = assignedTeams.has(team.id) && !selected;
        return <label className={`quality-form-team-option ${assignedToOtherForm ? "assigned" : ""}`} key={team.id}><input type="checkbox" checked={selected} disabled={assignedToOtherForm} onChange={(event) => setDraft((current) => ({ ...current, teamIds: event.target.checked ? [...current.teamIds, team.id] : current.teamIds.filter((id) => id !== team.id) }))} /><span>{team.name}</span>{assignedToOtherForm && <small>Assigned to another form</small>}</label>;
      }) : <p>No teams are available. Create a team before assigning this form.</p>}</fieldset>
      {!draft.teamIds.length && teams.length > 0 && <p className="quality-question-info" role="alert">Select at least one team before saving. A team can be assigned to only one active form.</p>}
    </section>

    <section className="quality-workflow-section">
      <header className="quality-workflow-section-heading"><span className="quality-workflow-step">02</span><div><span className="quality-eyebrow">QUESTIONS</span><h3>Build your questions</h3><p>Add any number of questions in the order you want them answered. Single-choice questions use the selected option's points; multiple-choice questions add the selected options' points.</p></div></header>
      <div className="quality-question-list">{draft.questions.map((question, index) => <QuestionEditor key={question.id} question={question} index={index} onChange={(next) => updateQuestion(question.id, next)} onRemove={() => setDraft((current) => ({ ...current, questions: current.questions.filter((item) => item.id !== question.id) }))} />)}</div>
      <button className="quality-add-question" type="button" onClick={() => setDraft((current) => ({ ...current, questions: [...current.questions, newQuestion()] }))}><Plus size={16} /> Add question</button>
      <p className="quality-form-points-total">Maximum possible points: <strong>{numberLabel(maximumPoints)}</strong></p>
      {maximumPoints <= 0 && <p className="quality-question-info" role="alert">Assign points to at least one choice before saving this form.</p>}
    </section>

    <section className="quality-workflow-section quality-score-section">
      <header className="quality-workflow-section-heading"><span className="quality-workflow-step">03</span><div><span className="quality-eyebrow">ALWAYS INCLUDED</span><h3>Feedback & score</h3><p>Each evaluation includes written feedback. The score is calculated from scored answers and normalized to 100; date, text, and unscored questions are excluded.</p></div></header>
      <div className="quality-automatic-items"><span><FileText size={17} /><b>Call feedback</b><small>Required written notes</small></span><span><BadgeCheck size={17} /><b>Quality score</b><small>Calculated from scored answers</small></span></div>
    </section>

    <footer className="quality-workflow-actions"><button className="quality-workflow-cancel" type="button" onClick={onBack}>Cancel</button><button className="quality-workflow-save" type="submit" disabled={saving || !draft.teamIds.length || !draft.questions.length || maximumPoints <= 0}>{saving ? "Saving..." : <><Save size={16} /> {form ? "Save changes" : "Save form"}</>}</button></footer>
  </form>;
}

export function QualityFormsLibrary({ onBack, canManageForms = false }) {
  const [forms, setForms] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("list");
  const [editingForm, setEditingForm] = useState(null);

  const loadForms = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await window.qaDesk.qualityEvaluation.formsList();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setForms(result.forms);
      setTeams(result.teams || []);
    } catch {
      setError("Forms could not be loaded. Check the database connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadForms(); }, [loadForms]);

  async function saveForm(draft) {
    setSaving(true);
    setError("");
    try {
      const result = await window.qaDesk.qualityEvaluation.formSave(draft);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setMode("list");
      setEditingForm(null);
      await loadForms();
    } catch {
      setError("Form could not be saved. Check the database connection.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteForm(form) {
    if (!window.confirm(`Delete "${form.name}" from the active form library? Existing evaluations and saved form snapshots will be retained.`)) return;
    setSaving(true);
    setError("");
    try {
      const result = await window.qaDesk.qualityEvaluation.formDelete(form.id);
      if (!result.ok) { setError(result.message); return; }
      setForms((current) => current.filter((item) => item.id !== form.id));
    } catch {
      setError("Form could not be deleted. Check the database connection.");
    } finally {
      setSaving(false);
    }
  }

  if (mode === "builder" && canManageForms) {
    const assignedTeams = new Set(forms.flatMap((item) => item.id === editingForm?.id ? [] : item.teamIds || []));
    return <FormBuilder form={editingForm} teams={teams} assignedTeams={assignedTeams} saving={saving} error={error} onBack={() => { setMode("list"); setError(""); }} onSave={saveForm} />;
  }

  return <section className="quality-forms-page">
    <div className="quality-workflow-topline"><button className="quality-workflow-back" type="button" onClick={onBack}><ArrowLeft size={16} /> Quality evaluation</button><span className="quality-eyebrow">FORM LIBRARY</span></div>
    <header className="quality-forms-heading"><div><span className="quality-workflow-title-icon"><ClipboardList size={21} /></span><div><h2>Evaluation forms</h2><p>Forms are reused across monthly call evaluations. Saved answers retain a snapshot of the form.</p></div></div>{canManageForms && <button className="quality-workflow-save" type="button" onClick={() => { setEditingForm(null); setError(""); setMode("builder"); }}><Plus size={16} /> New form</button>}</header>
    {error && <div className="quality-workflow-error" role="alert"><CircleAlert size={16} />{error}</div>}
    {loading ? <div className="quality-empty-state"><span className="quality-spinner" /><p>Loading forms...</p></div> : forms.length === 0 ? <div className="quality-empty-state"><span className="quality-empty-icon"><ClipboardList size={24} /></span><h3>No evaluation forms yet</h3><p>{canManageForms ? "Create a form with scored choice questions. Date and text questions are informational only." : "No saved evaluation forms are available yet."}</p>{canManageForms && <button className="quality-workflow-save" type="button" onClick={() => { setEditingForm(null); setMode("builder"); }}><Plus size={16} /> Create first form</button>}</div> : <div className="quality-form-list">{forms.map((form) => <article className="quality-form-list-card" key={form.id}><span className="quality-form-list-icon"><ClipboardCheck size={20} /></span><div><h3>{form.name}</h3><p>{form.teamNames?.length ? `Teams: ${form.teamNames.join(", ")}` : "No teams assigned"} · Score calculated from answers</p></div>{canManageForms && <div className="quality-form-list-actions"><button className="quality-form-edit" type="button" disabled={saving} onClick={() => { setEditingForm(form); setError(""); setMode("builder"); }}><Pencil size={15} /> Edit</button><button className="quality-form-delete" type="button" disabled={saving} onClick={() => void deleteForm(form)} aria-label={`Delete ${form.name}`} title={`Delete ${form.name}`}><Trash2 size={15} /> Delete</button></div>}</article>)}</div>}
  </section>;
}

function displayAnswer(question, answer) {
  if (Array.isArray(answer)) return answer.join(", ") || "—";
  return String(answer || "—");
}

function SavedEvaluationReview({ evaluation, employee, month, onBack, onEdit }) {
  const snapshot = evaluation.formSnapshot;
  return <section className="quality-review-page">
    <div className="quality-workflow-topline"><button className="quality-workflow-back" type="button" onClick={onBack}><ArrowLeft size={16} /> Call evaluations</button><span className="quality-eyebrow">SAVED CALL REVIEW</span></div>
    <header className="quality-review-heading"><span className="quality-review-icon"><ShieldCheck size={22} /></span><div><h2>{employee.fullName}</h2><p>{employee.teamName} · Call {evaluation.callIndex} · {monthLabel(month)}</p></div><button className="quality-workflow-save" type="button" onClick={onEdit}><Pencil size={15} /> Edit evaluation</button></header>
    <section className="quality-review-result"><div><span>Quality score</span><strong>{numberLabel(evaluation.score)}<small> / 100</small></strong></div><div><span>Call reference</span><strong>{evaluation.callReference || `Call ${evaluation.callIndex}`}</strong></div><div><span>Evaluation type</span><strong>{snapshot?.name || "Direct evaluation"}</strong></div></section>
    {snapshot?.questions?.length > 0 && <section className="quality-review-form"><h3>{snapshot.name}</h3>{snapshot.questions.map((question, index) => <article className="quality-answer-row" key={question.id}><span>Question {index + 1}</span><strong>{question.label}</strong><p>{displayAnswer(question, evaluation.answers?.[question.id])}</p></article>)}</section>}
    <section className="quality-review-form direct-review-feedback"><h3>Call feedback</h3><p>{evaluation.feedback}</p></section>
  </section>;
}

function EvaluationRunner({ employee, month, callIndex, forms, savedCc, loading, saving, error, onBack, onSave, evaluation }) {
  const [answers, setAnswers] = useState(evaluation?.answers || {});
  const [feedback, setFeedback] = useState(evaluation?.feedback || "");
  const [callReference, setCallReference] = useState(evaluation?.callReference || "");
  const [cc, setCc] = useState(savedCc.join(", "));
  const [rememberCc, setRememberCc] = useState(savedCc.length > 0);
  const form = forms[0];
  const scoreResult = form ? calculateFormScore(form, answers) : { earnedPoints: 0, maximumPoints: 0, score: null };
  const answersComplete = Boolean(form) && form.questions.every((question) => {
    if (!question.required) return true;
    const answer = answers[question.id];
    return question.type === "multi"
      ? Array.isArray(answer) && answer.length > 0
      : typeof answer === "string" && answer.trim().length > 0;
  });
  const validScore = scoreResult.score !== null;

  function updateAnswer(questionId, answer) {
    setAnswers((current) => ({ ...current, [questionId]: answer }));
  }

  return <form className="quality-runner" onSubmit={(event) => { event.preventDefault(); onSave({ employeeId: employee.id, month, callIndex, answers, feedback, score: scoreResult.score, callReference, cc, rememberCc }); }}>
    <div className="quality-workflow-topline"><button className="quality-workflow-back" type="button" onClick={onBack}><ArrowLeft size={16} /> Call evaluations</button><span className="quality-eyebrow">CALL {callIndex} OF MONTHLY TARGET</span></div>
    <header className="quality-runner-heading"><span className="quality-workflow-title-icon"><Headphones size={21} /></span><div><h2>Evaluate call {callIndex}</h2><p>{employee.fullName} · {employee.teamName} · {monthLabel(month)}</p><div className="quality-queue-identifiers"><span><b>AWFAR</b> {employee.awfarCode || "Not assigned"}</span><span><b>3CX</b> {employee.code3cx || "Not assigned"}</span></div></div></header>
    {error && <div className="quality-workflow-error" role="alert"><CircleAlert size={16} />{error}</div>}
    {!forms.length ? <div className="quality-empty-state"><span className="quality-empty-icon"><ClipboardList size={24} /></span><h3>No forms available</h3><p>Create a Quality Evaluation form before evaluating a call.</p><button className="quality-workflow-back" type="button" onClick={onBack}>Back to calls</button></div> : <>
      <section className="quality-runner-section"><div className="quality-assigned-form"><span>Assigned evaluation form</span><strong>{form?.name || "No form assigned"}</strong><small>Selected automatically for {employee.teamName}</small></div><label className="quality-workflow-field"><span>Call reference <small>Optional until call records are connected</small></span><input value={callReference} onChange={(event) => setCallReference(event.target.value)} maxLength={160} placeholder="Call ID or reference" /></label><div className="quality-workflow-field quality-cc-field"><label htmlFor="quality-cc-recipients"><span><Mail size={14} /> CC recipients <small>Optional · separate with commas</small></span></label><input id="quality-cc-recipients" value={cc} onChange={(event) => setCc(event.target.value)} maxLength={1000} placeholder="quality@company.com, manager@company.com" /><label className="quality-cc-remember"><input type="checkbox" checked={rememberCc} onChange={(event) => setRememberCc(event.target.checked)} /><span>Remember this CC for my account only</span></label></div></section>
      {form && <section className="quality-runner-section"><header className="quality-runner-section-heading"><div><span className="quality-eyebrow">{form.name}</span><h3>Call questions</h3></div><span>{form.questions.length} questions</span></header><div className="quality-runner-questions">{form.questions.map((question, index) => <article className="quality-runner-question" key={question.id}><label className="quality-runner-question-title">{index + 1}. {question.label}{question.required && <b> *</b>}</label>{question.type === "single" ? <div className="quality-answer-options">{question.options.map((option) => <label className="quality-answer-option" key={option}><input type="radio" name={question.id} checked={answers[question.id] === option} onChange={() => updateAnswer(question.id, option)} required={question.required} /><span>{option}</span>{question.scored && <small>{numberLabel(question.optionScores?.[question.options.indexOf(option)] || 0)} pts</small>}</label>)}</div> : question.type === "multi" ? <div className="quality-answer-options">{question.options.map((option, optionIndex) => { const selected = Array.isArray(answers[question.id]) ? answers[question.id] : []; return <label className="quality-answer-option" key={option}><input type="checkbox" checked={selected.includes(option)} onChange={(event) => updateAnswer(question.id, event.target.checked ? [...selected, option] : selected.filter((item) => item !== option))} /><span>{option}</span>{question.scored && <small>{numberLabel(question.optionScores?.[optionIndex] || 0)} pts</small>}</label>; })}</div> : question.type === "date" ? <input className="quality-answer-input" type="date" value={answers[question.id] || ""} onChange={(event) => updateAnswer(question.id, event.target.value)} required={question.required} /> : <textarea className="quality-answer-input quality-answer-text" value={answers[question.id] || ""} onChange={(event) => updateAnswer(question.id, event.target.value)} maxLength={5000} rows={3} required={question.required} placeholder="Type the answer" />}</article>)}</div></section>}
      <section className="quality-runner-section quality-final-section"><header className="quality-runner-section-heading"><span className="quality-workflow-title-icon"><BadgeCheck size={19} /></span><div><span className="quality-eyebrow">AUTOMATIC FORM ENDING</span><h3>Feedback & score</h3><p>Required for every saved call evaluation. Text and date answers are informational only.</p></div></header><label className="quality-workflow-field"><span>Call feedback</span><textarea className="quality-answer-input quality-answer-text" value={feedback} onChange={(event) => setFeedback(event.target.value)} maxLength={10000} rows={4} placeholder="Write clear, constructive feedback for this call" required /></label><div className="quality-calculated-score"><span>Calculated quality score</span><strong>{validScore ? `${numberLabel(scoreResult.score)} / 100` : "No scored choices configured"}</strong><small>{validScore ? `${numberLabel(scoreResult.earnedPoints)} of ${numberLabel(scoreResult.maximumPoints)} available points` : "Ask an administrator to configure scoring for this form."}</small></div></section>
      <footer className="quality-workflow-actions">{evaluation && <span className="quality-email-edit-note"><Mail size={14} /> Saving changes will resend the evaluation email.</span>}<button className="quality-workflow-cancel" type="button" onClick={onBack}>Cancel</button><button className="quality-workflow-save" type="submit" disabled={saving || loading || !form || !answersComplete || !feedback.trim() || !validScore}>{saving ? "Saving..." : <><Save size={16} /> {evaluation ? "Save changes & resend email" : "Save evaluation"}</>}</button></footer>
    </>}
  </form>;
}

export function EmployeeCallEvaluationFlow({ employee, month, evaluatorId, onBack, onOpenForms }) {
  const [queue, setQueue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [emailNotice, setEmailNotice] = useState(null);
  const [mode, setMode] = useState("list");
  const [callIndex, setCallIndex] = useState(0);
  const [review, setReview] = useState(null);
  const [editingEvaluation, setEditingEvaluation] = useState(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await window.qaDesk.qualityEvaluation.callList(employee.id, month);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setQueue(result);
    } catch {
      setError("Call evaluation slots could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [employee.id, month]);

  useEffect(() => { void loadQueue(); }, [loadQueue]);

  const evaluations = queue?.evaluations || [];
  const evaluationsByIndex = new Map(evaluations.map((evaluation) => [evaluation.callIndex, evaluation]));
  const pendingCount = Math.max((queue?.targetCount || 0) - evaluations.length, 0);

  async function saveCall(input) {
    setSaving(true);
    setError("");
    try {
      const result = await window.qaDesk.qualityEvaluation.callSave({ ...input, evaluatorId });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setEmailNotice(result.emailStatus || null);
      setMode("list");
      setCallIndex(0);
      setEditingEvaluation(null);
      await loadQueue();
    } catch {
      setError("Call evaluation could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  function startFormEvaluation(number, evaluation = null) {
    setCallIndex(number);
    setEditingEvaluation(evaluation);
    setError("");
    setMode("evaluate");
  }

  if (mode === "evaluate") return <EvaluationRunner employee={employee} month={month} callIndex={callIndex} forms={queue?.forms || []} savedCc={queue?.savedCc || []} loading={loading} saving={saving} error={error} evaluation={editingEvaluation} onBack={() => { setMode("list"); setEditingEvaluation(null); setError(""); }} onSave={saveCall} />;
  if (mode === "review" && review) return <SavedEvaluationReview employee={employee} month={month} evaluation={review} onBack={() => setMode("list")} onEdit={() => startFormEvaluation(review.callIndex, review)} />;

  return <section className="quality-call-queue">
    <div className="quality-workflow-topline"><button className="quality-workflow-back" type="button" onClick={onBack}><ArrowLeft size={16} /> Quality evaluation</button><span className="quality-eyebrow">MONTHLY CALL QUEUE</span></div>
    <header className="quality-call-queue-heading"><span className="quality-review-icon"><Headphones size={22} /></span><div><h2>{employee.fullName}</h2><p>{employee.teamName} · {employee.employeeType} · {monthLabel(month)}</p><div className="quality-queue-identifiers"><span><b>AWFAR</b> {queue?.employee?.awfarCode || employee.awfarCode || "Not assigned"}</span><span><b>3CX</b> {queue?.employee?.code3cx || employee.code3cx || "Not assigned"}</span></div></div></header>
    {error && <div className="quality-workflow-error" role="alert"><CircleAlert size={16} />{error}</div>}
    {emailNotice && <div className={`quality-email-status ${emailNotice.state}`} role="status"><Mail size={16} /><span>{emailNotice.message}</span></div>}
    {loading ? <div className="quality-empty-state"><span className="quality-spinner" /><p>Loading call evaluation slots...</p></div> : queue && <>
      <div className="quality-queue-stats"><article><span>Required calls</span><strong>{queue.targetCount}</strong></article><article><span>Evaluated</span><strong>{evaluations.length}</strong></article><article><span>Remaining</span><strong>{pendingCount}</strong></article></div>
      {!queue.forms.length && <div className="quality-direct-mode-note"><CircleAlert size={16} /><span>No scored evaluation forms are available. {onOpenForms ? <>Ask an administrator to <button type="button" onClick={onOpenForms}>create or configure a form</button>.</> : "Ask an administrator to create or configure a form."}</span></div>}
      <div className="quality-call-slot-list">{Array.from({ length: queue.targetCount }, (_, index) => {
        const number = index + 1;
        const saved = evaluationsByIndex.get(number);
        return <article className={`quality-call-slot ${saved ? "complete" : "pending"}`} key={number}>
          <span className={`quality-call-slot-icon ${saved ? "complete" : "pending"}`}>{saved ? <Check size={17} /> : <Headphones size={17} />}</span>
          <div className="quality-call-slot-content"><div><h3>Call {String(number).padStart(2, "0")}</h3><span>{saved ? saved.formName : "Pending evaluation"}</span></div>{saved && <><p className="quality-slot-feedback">{saved.feedback}</p><div className="quality-slot-meta"><span className="quality-slot-score"><BadgeCheck size={14} />{numberLabel(saved.score)} / 100</span><span>{saved.callReference || "No reference"}</span></div></>}</div>
          <div className="quality-call-slot-actions">{saved ? <><button type="button" className="quality-view-evaluation" onClick={() => { setReview(saved); setMode("review"); }}>View evaluation</button>{queue.forms.length > 0 && <button type="button" className="quality-edit-evaluation" onClick={() => startFormEvaluation(number, saved)}><Pencil size={13} /> Edit evaluation</button>}</> : queue.forms.length > 0 && <button type="button" className="quality-call-start" onClick={() => startFormEvaluation(number)}><Headphones size={14} /> Start evaluation</button>}</div>
        </article>;
      })}</div>
    </>}
  </section>;
}
