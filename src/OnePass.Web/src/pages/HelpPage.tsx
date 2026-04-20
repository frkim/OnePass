import { useTranslation, Trans } from 'react-i18next';
import { PageHeader } from '../components/PageShell';

/**
 * Help / glossary page reachable from the user menu. Walks newcomers
 * through the OnePass domain model (Organisation → Event → Activity →
 * Participant → Scan) using a concrete worked example so the abstract
 * hierarchy clicks immediately.
 */
export default function HelpPage() {
  const { t } = useTranslation();

  return (
    <>
      <PageHeader title={t('help.title')} />

      <div className="card">
        <p>{t('help.intro')}</p>
      </div>

      <div className="card">
        <h2>{t('help.hierarchyTitle')}</h2>
        <pre className="help-tree" aria-label={t('help.hierarchyTitle') as string}>
{`Organisation
└── Event
    └── Activity
        ├── Participant
        └── Scan (Activity × Participant × User)`}
        </pre>
      </div>

      <div className="card">
        <h2>{t('help.entitiesTitle')}</h2>

        <section className="help-entity">
          <h3>{t('help.org.title')}</h3>
          <p>{t('help.org.desc')}</p>
          <ul>
            <li><Trans i18nKey="help.org.bullet1" /></li>
            <li><Trans i18nKey="help.org.bullet2" /></li>
            <li><Trans i18nKey="help.org.bullet3" /></li>
          </ul>
        </section>

        <section className="help-entity">
          <h3>{t('help.event.title')}</h3>
          <p>{t('help.event.desc')}</p>
          <ul>
            <li><Trans i18nKey="help.event.bullet1" /></li>
            <li><Trans i18nKey="help.event.bullet2" /></li>
          </ul>
        </section>

        <section className="help-entity">
          <h3>{t('help.activity.title')}</h3>
          <p>{t('help.activity.desc')}</p>
          <ul>
            <li><Trans i18nKey="help.activity.bullet1" /></li>
            <li><Trans i18nKey="help.activity.bullet2" /></li>
            <li><Trans i18nKey="help.activity.bullet3" /></li>
          </ul>
        </section>

        <section className="help-entity">
          <h3>{t('help.participant.title')}</h3>
          <p>{t('help.participant.desc')}</p>
          <ul>
            <li><Trans i18nKey="help.participant.bullet1" /></li>
            <li><Trans i18nKey="help.participant.bullet2" /></li>
          </ul>
        </section>

        <section className="help-entity">
          <h3>{t('help.scan.title')}</h3>
          <p>{t('help.scan.desc')}</p>
          <ul>
            <li><Trans i18nKey="help.scan.bullet1" /></li>
            <li><Trans i18nKey="help.scan.bullet2" /></li>
          </ul>
        </section>

        <section className="help-entity">
          <h3>{t('help.user.title')}</h3>
          <p>{t('help.user.desc')}</p>
          <ul>
            <li><Trans i18nKey="help.user.role.admin" /></li>
            <li><Trans i18nKey="help.user.role.scanner" /></li>
            <li><Trans i18nKey="help.user.role.viewer" /></li>
          </ul>
        </section>

        <section className="help-entity">
          <h3>{t('help.invitation.title')}</h3>
          <p>{t('help.invitation.desc')}</p>
        </section>
      </div>

      <div className="card">
        <h2>{t('help.exampleTitle')}</h2>
        <p>{t('help.exampleIntro')}</p>
        <pre className="help-tree" aria-label={t('help.exampleTitle') as string}>
{`Microsoft                          ← Organisation
└── Devoxx                         ← Event (annual developer conference)
    ├── CraneGrabberClawMachine    ← Activity (booth game, 1 scan / attendee)
    ├── KeynoteCheckIn             ← Activity (entry, 1 scan / attendee)
    └── HandsOnLab                 ← Activity (3 scans max / attendee)
        ├── Alice  (badge #A-001)  ← Participant
        ├── Bob    (badge #A-002)  ← Participant
        └── …
            └── Scan @ 09:42 by user "scanner-jane"`}
        </pre>
        <p><Trans i18nKey="help.exampleNarrative" /></p>
      </div>

      <div className="card">
        <h2>{t('help.workflowTitle')}</h2>
        <ol>
          <li><Trans i18nKey="help.workflow.step1" /></li>
          <li><Trans i18nKey="help.workflow.step2" /></li>
          <li><Trans i18nKey="help.workflow.step3" /></li>
          <li><Trans i18nKey="help.workflow.step4" /></li>
          <li><Trans i18nKey="help.workflow.step5" /></li>
          <li><Trans i18nKey="help.workflow.step6" /></li>
        </ol>
      </div>
    </>
  );
}
