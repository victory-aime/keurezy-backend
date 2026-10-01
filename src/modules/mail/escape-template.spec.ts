jest.mock('resend', () => ({ Resend: class {} }));
import { escapeTemplateVariables } from './resend.service';

describe('escapeTemplateVariables', () => {
  it('échappe le texte fourni par les utilisateurs (injection HTML dans un e-mail)', () => {
    expect(
      escapeTemplateVariables({
        AGENCY_NAME: '<a href="https://phishing.example">Cliquez</a> & Co',
        PROPERTY_TITLE: "Villa l'Oasis",
      }),
    ).toEqual({
      AGENCY_NAME: '&lt;a href=&quot;https://phishing.example&quot;&gt;Cliquez&lt;/a&gt; &amp; Co',
      PROPERTY_TITLE: 'Villa l&#39;Oasis',
    });
  });

  it('laisse intacts les liens construits par le backend et les valeurs non textuelles', () => {
    const link = 'https://app.keurezy.sn/reset?token=a&b=c';
    expect(escapeTemplateVariables({ RESET_LINK: link, OTP: 123456, APP_NAME: undefined })).toEqual(
      {
        RESET_LINK: link,
        OTP: 123456,
        APP_NAME: undefined,
      },
    );
  });
});
