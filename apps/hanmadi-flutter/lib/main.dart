import 'package:flutter/semantics.dart';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';

import 'api.dart';
import 'session.dart';
import 'study_model.dart';
import 'app.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  if (kIsWeb) {
    SemanticsBinding.instance.ensureSemantics();
  }
  final api = StudyApi();
  runApp(HanmadiApp(model: StudyModel(api), session: ClientSession(api)));
}
