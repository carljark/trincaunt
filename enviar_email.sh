#!/bin/bash
if [ $# -lt 3 ]
then
  echo "arg1:asunto"
  echo "arg2:cuerpo"
  echo "arg3:destino"
  echo "arg4:adjunto"
  exit 1
fi

asunto="$1"
cuerpo="$2"
destino="$3"
# En Arch s-nail instala `mail`; en Ubuntu solo `s-nail`
mail_cmd=$(command -v mail || command -v s-nail) || { echo "No encuentro mail ni s-nail" >&2; exit 1; }
if [[ -n "$4" ]]
then
  file=$4
  echo "${cuerpo}" | "$mail_cmd" -s "${asunto}"  -a "${file}" "${destino}"

else
  echo "${cuerpo}" | "$mail_cmd" -s "${asunto}" "${destino}"

fi
